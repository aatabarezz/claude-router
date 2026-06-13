import { ipcMain, dialog } from 'electron'
import { getDb } from '../db'
import ExcelJS from 'exceljs'
import path from 'path'
import os from 'os'

export function registerExportHandlers(): void {
  ipcMain.handle('export:complianceReport', async (_e, companyId: string) => {
    const db = getDb()

    const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId) as { name: string } | undefined
    const piiStats = db.prepare(`
      SELECT
        COUNT(*) as total_scanned,
        SUM(CASE WHEN json_array_length(pii_entities_found) > 0 THEN 1 ELSE 0 END) as pii_detected,
        SUM(pii_sent_to_cloud) as sent_to_cloud
      FROM pii_audit_log pal
      JOIN departments d ON pal.department_id = d.id
      WHERE d.company_id = ?
    `).get(companyId) as { total_scanned: number; pii_detected: number; sent_to_cloud: number }

    const deptStats = db.prepare(`
      SELECT d.name,
        COUNT(pal.id) as scanned,
        SUM(CASE WHEN json_array_length(pal.pii_entities_found) > 0 THEN 1 ELSE 0 END) as detected
      FROM departments d
      LEFT JOIN pii_audit_log pal ON pal.department_id = d.id
      WHERE d.company_id = ?
      GROUP BY d.id, d.name
    `).all(companyId) as Array<{ name: string; scanned: number; detected: number }>

    const { filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(
        os.homedir(),
        `claude-router-compliance-${new Date().toISOString().slice(0, 10)}.xlsx`
      ),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })

    if (!filePath) return { success: false }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Claude Router'
    wb.created = new Date()

    // Summary sheet
    const summary = wb.addWorksheet('Compliance Summary')
    summary.addRow(['Claude Router PII Compliance Report'])
    summary.addRow(['Generated', new Date().toISOString()])
    summary.addRow(['Company', company?.name ?? 'Unknown'])
    summary.addRow([])
    summary.addRow(['Metric', 'Value'])
    summary.addRow(['Total Messages Scanned', piiStats.total_scanned])
    summary.addRow(['Messages with PII Detected', piiStats.pii_detected])
    summary.addRow(['Raw PII Sent to Cloud', piiStats.sent_to_cloud])
    summary.addRow(['COMPLIANCE STATUS', piiStats.sent_to_cloud === 0 ? '✓ COMPLIANT — Zero raw PII to cloud' : '⚠ REVIEW REQUIRED'])

    // Dept sheet
    const deptSheet = wb.addWorksheet('By Department')
    deptSheet.addRow(['Department', 'Messages Scanned', 'PII Detected'])
    for (const d of deptStats) {
      deptSheet.addRow([d.name, d.scanned, d.detected])
    }

    await wb.xlsx.writeFile(filePath)
    return { success: true, filePath }
  })
}
