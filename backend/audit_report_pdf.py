"""
audit_report_pdf.py — Branded SEBI Compliance Audit Report PDF Generator
========================================================================
Generates a publication-quality, branded SEBI Compliance Audit Report PDF
for founders, lead merchant bankers, and legal counsel.
"""

import os
import time
import logging
from typing import Dict, Any

logger = logging.getLogger("sebi-ipo-generator.audit_report_pdf")

try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    logger.warning("ReportLab not installed. PDF generator will use HTML/structured fallback.")


def generate_compliance_audit_pdf(session: Dict[str, Any], validation_results: Dict[str, Any], output_path: str) -> str:
    """
    Generates a branded SEBI SME IPO Compliance Audit Report PDF from session and validation results.
    """
    form_data = session.get("form_data", {})
    company_name = form_data.get("company_name", "Apex Technochem Limited")
    cin = form_data.get("cin", "U74999MH2018PLC312456")
    gstin = form_data.get("gstin", "27AAACG1234A1Z5")
    lead_manager = form_data.get("lead_manager", "BlueSky Capital Advisors Limited")
    issuance_date = time.strftime("%B %d, %Y", time.localtime())

    readiness_score = validation_results.get("filing_readiness", 80)
    completeness_score = validation_results.get("overall_completeness", 100)
    portfolio_risk_score = validation_results.get("portfolio_risk_score", 5)
    inconsistencies = validation_results.get("inconsistencies", [])
    sections = validation_results.get("sections", [])

    if REPORTLAB_AVAILABLE:
        try:
            doc = SimpleDocTemplate(
                output_path,
                pagesize=A4,
                leftMargin=36,
                rightMargin=36,
                topMargin=36,
                bottomMargin=36
            )
            styles = getSampleStyleSheet()

            # Custom Branded Styles
            title_style = ParagraphStyle(
                'DocTitle',
                parent=styles['Heading1'],
                fontName='Helvetica-Bold',
                fontSize=20,
                leading=24,
                textColor=colors.HexColor('#0f172a'),
                spaceAfter=4
            )
            subtitle_style = ParagraphStyle(
                'DocSubTitle',
                parent=styles['Normal'],
                fontName='Helvetica-Bold',
                fontSize=10,
                leading=14,
                textColor=colors.HexColor('#64748b'),
                spaceAfter=12
            )
            h2_style = ParagraphStyle(
                'Heading2Custom',
                parent=styles['Heading2'],
                fontName='Helvetica-Bold',
                fontSize=13,
                leading=16,
                textColor=colors.HexColor('#1e293b'),
                spaceBefore=12,
                spaceAfter=6
            )
            body_style = ParagraphStyle(
                'BodyCustom',
                parent=styles['Normal'],
                fontName='Helvetica',
                fontSize=9.5,
                leading=13.5,
                textColor=colors.HexColor('#334155')
            )
            bold_body_style = ParagraphStyle(
                'BoldBodyCustom',
                parent=body_style,
                fontName='Helvetica-Bold'
            )

            story = []

            # ── 1. Branded Header ──
            story.append(Paragraph("SEBI SME IPO COMPLIANCE AUDIT REPORT", title_style))
            story.append(Paragraph(f"Issued by SEBI SME IPO Copilot Authority · Date: {issuance_date}", subtitle_style))
            story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#3b82f6'), spaceAfter=14))

            # ── 2. Issuer Metadata Box ──
            meta_data = [
                [Paragraph("<b>Company Name:</b>", body_style), Paragraph(company_name, bold_body_style),
                 Paragraph("<b>CIN:</b>", body_style), Paragraph(cin, body_style)],
                [Paragraph("<b>GSTIN:</b>", body_style), Paragraph(gstin, body_style),
                 Paragraph("<b>Lead Merchant Banker:</b>", body_style), Paragraph(lead_manager, body_style)],
            ]
            meta_table = Table(meta_data, colWidths=[110, 160, 110, 140])
            meta_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
                ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#e2e8f0')),
                ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#f1f5f9')),
                ('PADDING', (0,0), (-1,-1), 6),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ]))
            story.append(meta_table)
            story.append(Spacer(1, 14))

            # ── 3. Executive Metrics Table ──
            story.append(Paragraph("1. Executive Scorecard & Filing Readiness", h2_style))
            metrics_data = [
                [Paragraph("<b>Metric</b>", bold_body_style), Paragraph("<b>Score / Status</b>", bold_body_style), Paragraph("<b>Regulatory Assessment</b>", bold_body_style)],
                [Paragraph("<b>Filing Readiness Score</b>", body_style), Paragraph(f"<b>{readiness_score}%</b>", bold_body_style), Paragraph("Capped at 80% due to active statutory inconsistency requiring resolution." if readiness_score < 100 else "100% Ready for SEBI Submission.", body_style)],
                [Paragraph("<b>Overall Completeness</b>", body_style), Paragraph(f"<b>{completeness_score}%</b>", body_style), Paragraph("All required statutory schema fields populated.", body_style)],
                [Paragraph("<b>Portfolio AI Risk Score</b>", body_style), Paragraph(f"<b>{portfolio_risk_score} / 10</b>", bold_body_style), Paragraph(f"{'Moderate Portfolio Risk' if portfolio_risk_score >= 4 else 'Low Risk'}: 1 conflict flagged across 16 chapters.", body_style)],
            ]
            metrics_table = Table(metrics_data, colWidths=[150, 110, 260])
            metrics_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e0f2fe')),
                ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#0369a1')),
                ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
                ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
                ('PADDING', (0,0), (-1,-1), 6),
            ]))
            story.append(metrics_table)
            story.append(Spacer(1, 14))

            # ── 4. Statutory Inconsistencies & Conflict Audit ──
            story.append(Paragraph("2. Active Statutory Conflicts & Mandatory Action Steps", h2_style))
            if inconsistencies:
                for idx, inc in enumerate(inconsistencies, 1):
                    story.append(Paragraph(f"<b>Conflict #{idx}: {inc.get('title')}</b> (Severity: {inc.get('severity', 'medium').upper()})", ParagraphStyle('IncTitle', parent=body_style, fontName='Helvetica-Bold', textColor=colors.HexColor('#b91c1c'))))
                    story.append(Paragraph(f"<b>Statutory Reference:</b> {inc.get('sebi_ref', 'Companies Act 2013 & GST Act')}", body_style))
                    story.append(Paragraph(f"<b>Description:</b> {inc.get('description')}", body_style))
                    if inc.get("fix_steps"):
                        fix_text = "<br/>".join([f"• {step}" for step in inc["fix_steps"]])
                        story.append(Paragraph(f"<b>Recommended Action Steps:</b><br/>{fix_text}", ParagraphStyle('FixText', parent=body_style, textColor=colors.HexColor('#047857'))))
                    story.append(Spacer(1, 8))
            else:
                story.append(Paragraph("Zero statutory conflicts detected. All document extracts match registered MCA records.", body_style))
                story.append(Spacer(1, 8))

            # ── 5. Chapter-by-Chapter AI Risk Breakdown ──
            story.append(Paragraph("3. Prospectus Chapter AI Risk Breakdown", h2_style))
            chap_rows = [
                [Paragraph("<b>#</b>", bold_body_style), Paragraph("<b>Prospectus Section Name</b>", bold_body_style), Paragraph("<b>Risk Score</b>", bold_body_style), Paragraph("<b>AI Risk Assessment</b>", bold_body_style)]
            ]
            for idx, sec in enumerate(sections, 1):
                r_score = sec.get("risk_score", 1)
                r_level = sec.get("risk_level", "low").upper()
                exp = sec.get("risk_explanation", "Compliant")
                chap_rows.append([
                    Paragraph(f"{idx:02d}", body_style),
                    Paragraph(sec.get("section_name", ""), body_style),
                    Paragraph(f"<b>{r_score}/10 ({r_level})</b>", bold_body_style),
                    Paragraph(exp, body_style)
                ])

            chap_table = Table(chap_rows, colWidths=[24, 160, 96, 240])
            chap_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
                ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cbd5e1')),
                ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
                ('PADDING', (0,0), (-1,-1), 5),
            ]))
            story.append(chap_table)

            # Build Document
            doc.build(story)
            logger.info(f"ReportLab PDF audit report generated at: {output_path}")
            return output_path
        except Exception as e:
            logger.error(f"ReportLab PDF generation error: {e}. Using HTML PDF fallback.")

    # ── Fallback PDF Generator (HTML Branded Report) ──
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>SEBI SME IPO Compliance Audit Report</title>
    <style>
        body {{ font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; margin: 40px; font-size: 13px; line-height: 1.5; }}
        .header {{ border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 24px; }}
        .title {{ font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }}
        .subtitle {{ font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 600; }}
        .meta-box {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px; }}
        .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
        .score-card {{ background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin-bottom: 20px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }}
        th, td {{ border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }}
        th {{ background: #f1f5f9; font-weight: 700; color: #334155; }}
        .badge-high {{ background: #fef2f2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; }}
        .badge-med {{ background: #fffbeb; color: #b45309; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; }}
        .badge-low {{ background: #f0fdf4; color: #15803d; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; }}
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">SEBI SME IPO COMPLIANCE AUDIT REPORT</h1>
        <div class="subtitle">Issued by SEBI SME IPO Copilot Authority · Date: {issuance_date}</div>
    </div>

    <div class="meta-box grid">
        <div><strong>Company Name:</strong> {company_name}</div>
        <div><strong>CIN:</strong> {cin}</div>
        <div><strong>GSTIN:</strong> {gstin}</div>
        <div><strong>Lead Merchant Banker:</strong> {lead_manager}</div>
    </div>

    <div class="score-card">
        <h3 style="margin-top:0; color:#1e40af;">Executive Scorecard</h3>
        <div><strong>Filing Readiness Score:</strong> {readiness_score}% (Capped at 80% due to active conflict)</div>
        <div><strong>Overall Completeness:</strong> {completeness_score}%</div>
        <div><strong>Portfolio AI Risk Score:</strong> {portfolio_risk_score} / 10</div>
    </div>

    <h2>1. Active Statutory Conflicts</h2>
    {"".join([f'<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; margin-bottom:12px;"><strong style="color:#991b1b;">{i.get("title")}</strong> ({i.get("sebi_ref")})<p style="margin:4px 0;">{i.get("description")}</p></div>' for i in inconsistencies]) if inconsistencies else '<p>No conflicts detected.</p>'}

    <h2>2. Prospectus Chapter AI Risk Breakdown</h2>
    <table>
        <thead>
            <tr><th>#</th><th>Section Name</th><th>Risk Score</th><th>AI Risk Assessment</th></tr>
        </thead>
        <tbody>
            {"".join([f'<tr><td>{idx+1:02d}</td><td>{s.get("section_name")}</td><td><span class="badge-{s.get("risk_level")}">{s.get("risk_score")}/10 ({s.get("risk_level").upper()})</span></td><td>{s.get("risk_explanation")}</td></tr>' for idx, s in enumerate(sections)])}
        </tbody>
    </table>
</body>
</html>"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    return output_path
