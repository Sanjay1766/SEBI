import os
import json
import logging
from typing import Dict, Any, List
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

# Configure logger
logger = logging.getLogger("sebi-ipo-generator.generator")

# Try to import groq for narrative generation
try:
    from groq import Groq
except ImportError:
    Groq = None

# Custom XML styling helpers for python-docx (shading, borders)
def set_cell_background(cell, hex_color: str):
    """Sets background color of a table cell."""
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Sets internal padding (margins) of a cell in dxa (1/20 of a pt)."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('w:top', top), ('w:bottom', bottom), ('w:left', left), ('w:right', right)]:
        node = OxmlElement(m)
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def generate_narrative_text(section_id: str, data: Dict[str, Any], prompt_desc: str) -> str:
    """Queries Groq to draft a section's narrative or uses a high-quality local fallback."""
    api_key = os.getenv("GROQ_API_KEY", "")
    is_mock = not api_key or "your_groq_api_key" in api_key
    
    company_name = data.get("company_name", "[Company Name]")
    products = data.get("products_services", "primary products")
    model = data.get("business_model", "operating model")
    customers = data.get("key_customers", "customer segments")
    industry = data.get("industry_name", "the sector")
    
    # Pre-crafted local templates for fallback
    local_drafts = {
        "risk_factors": f"Our business is heavily reliant on our core offerings, particularly {products}. Any material disruption in our production, supply chain, or client base could adversely affect our operations. Additionally, we operate in the competitive {industry} sector and are subject to regulatory shifts. Our internal risk checks indicate pending legal matters or promoter dependencies, which could affect management's focus. External factors like general economic inflation, GST filing compliance, and operational cost increases pose threats to margins.",
        "business_overview": f"{company_name} is a leading provider of {products}. Operating under a business model focused on {model}, we deliver services to key customer segments including {customers}. We maintain competitive advantages through operational efficiencies, quality certifications, and strong promoter relationships. Our manufacturing or delivery capabilities are scaled to service high-volume requirements in the local market.",
        "industry_overview": f"The Indian SME landscape for the {industry} sector has shown robust growth over recent years, supported by government initiatives like Make in India and digitisation efforts. Trends suggest a 12-15% CAGR in SME participation. In our sector, the competitive landscape is fragmented, presenting consolidation opportunities for organized players like {company_name}. Growing demand, coupled with tax registrations like GST, ensures formalized supply chains."
    }

    if is_mock or not Groq:
        return local_drafts.get(section_id, "Narrative content. Please verify data inputs and refine details.")

    try:
        client = Groq(api_key=api_key)
        prompt = f"""
        You are a SEBI merchant banker drafting an SME IPO Prospectus section.
        Draft the narrative section '{section_id}' ({prompt_desc}) for the company '{company_name}'.
        
        Use these facts only:
        - Products/services: {products}
        - Business model: {model}
        - Key customers: {customers}
        - Industry: {industry}
        - Risks: Internal = {data.get('internal_risks', 'Standard dependency')}, External = {data.get('external_risks', 'Market changes')}
        
        Guidelines:
        1. Write in a formal, legal, and professional corporate tone.
        2. Do NOT invent/hallucinate figures, financial metrics, or dates. Only state the provided facts.
        3. Keep it under 250 words.
        4. Do NOT include markdown styling or formatting in your text (no bolding, asterisks, etc.).
        
        Section Text:
        """
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.4,
        )
        return chat_completion.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Failed to generate narrative via Groq: {e}")
        return local_drafts.get(section_id, "")

def generate_draft_docx(session: Dict[str, Any], schema: Dict[str, Any], output_path: str):
    """Generates the 17-section word document using python-docx."""
    form_data = session.get("form_data", {})
    extracted_data = session.get("extracted_data", {})
    
    # Merge all data - form_data takes priority over extracted data
    merged = {}
    for doc_type, data in extracted_data.items():
        if isinstance(data, dict):
            merged.update(data)
    # form_data wins (user manually entered values take priority)
    merged.update(form_data)
            
    doc = Document()
    
    # Setup page margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        
    # Styles configuration
    styles = doc.styles
    normal_style = styles['Normal']
    normal_font = normal_style.font
    normal_font.name = 'Arial'
    normal_font.size = Pt(10.5)
    normal_font.color.rgb = RGBColor(51, 65, 85) # Slate 700

    # Colors
    c_brand = "0273CA" # Royal Blue Accent
    c_dark = "0F172A"  # Dark Slate Heading
    c_light = "F1F5F9" # Light Table Alternate Row

    # --- COVER PAGE ---
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_title = title_p.add_run("DRAFT RED HERRING PROSPECTUS\n")
    run_title.font.name = 'Arial'
    run_title.font.size = Pt(18)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(15, 23, 42)

    sub_p = doc.add_paragraph()
    sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_sub = sub_p.add_run("DRAFT - FOR INTERNAL REVIEW ONLY\n(Subject to revision and compliance with SEBI Regulations)")
    run_sub.font.size = Pt(11)
    run_sub.font.italic = True
    run_sub.font.color.rgb = RGBColor(220, 38, 38) # Red Alert

    doc.add_paragraph("\n" * 2)

    comp_p = doc.add_paragraph()
    comp_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_comp = comp_p.add_run(merged.get("company_name", "[Company Name]").upper() + "\n")
    run_comp.font.size = Pt(24)
    run_comp.font.bold = True
    run_comp.font.color.rgb = RGBColor(2, 115, 202)

    details_p = doc.add_paragraph()
    details_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    details_p.add_run(f"Incorporated on {merged.get('incorporation_date', '[Date]')} under the Companies Act, 2013\n")
    details_p.add_run(f"CIN: {merged.get('cin', '[Corporate Identification Number]')}\n")
    details_p.add_run(f"Registered Office: {merged.get('registered_office', '[Office Address]')}\n")

    doc.add_paragraph("\n" * 3)

    # Issue Table summary
    table = doc.add_table(rows=4, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    issue_data = [
        ("Issue Type", "Initial Public Offer (IPO) on SME Exchange"),
        ("Issue Size", f"₹ {merged.get('issue_size', '[Amount]')} Crores"),
        ("Price Band", f"₹ {merged.get('price_band', '[Price]')} per Share"),
        ("Lead Manager", merged.get('lead_manager', '[Lead Manager Name]'))
    ]
    
    for idx, (label, val) in enumerate(issue_data):
        row = table.rows[idx]
        cell_lbl, cell_val = row.cells[0], row.cells[1]
        
        cell_lbl.text = label
        cell_lbl.paragraphs[0].runs[0].font.bold = True
        cell_val.text = val
        
        set_cell_background(cell_lbl, c_light)
        set_cell_margins(cell_lbl, 120, 120, 150, 150)
        set_cell_margins(cell_val, 120, 120, 150, 150)
        
    doc.add_page_break()

    # --- TABLE OF CONTENTS (Static template list) ---
    h_toc = doc.add_paragraph()
    r_toc = h_toc.add_run("TABLE OF CONTENTS")
    r_toc.font.size = Pt(14)
    r_toc.font.bold = True
    r_toc.font.color.rgb = RGBColor(15, 23, 42)
    
    toc_items = [
        "1. Cover Page",
        "2. Table of Contents",
        "3. Definitions & Abbreviations",
        "4. Risk Factors",
        "5. Summary of the Offer",
        "6. General Information",
        "7. Capital Structure",
        "8. Objects of the Issue",
        "9. Business Overview",
        "10. Industry Overview",
        "11. Management & Promoters",
        "12. Related Party Transactions",
        "13. Financial Statements (Restated)",
        "14. Legal & Regulatory Disclosures",
        "15. Statutory Compliance Certificates",
        "16. Material Contracts & Documents for Inspection",
        "17. Declaration"
    ]
    for item in toc_items:
        doc.add_paragraph(item + " .......................................................................................................... Page X")
        
    doc.add_page_break()

    # --- POPULATE REMAINING SECTIONS ---
    # sec_counter tracks the printed section number.
    # Sections 1 (Cover Page) and 2 (Table of Contents) were written manually above.
    # Definitions (Section 3) is handled inside the skip block below.
    # All subsequent schema sections are numbered 4 – 17 as the counter increments.
    sec_counter = 3
    for sec in schema.get("sections", []):
        sec_id = sec["id"]
        sec_name = sec["name"]
        
        # Skip Cover page and TOC
        if sec_id in ["cover_page", "definitions"]:
            # Standard custom handling for Definitions
            if sec_id == "definitions":
                h = doc.add_paragraph()
                r = h.add_run(f"3. {sec_name.upper()}")
                r.font.size = Pt(14)
                r.font.bold = True
                r.font.color.rgb = RGBColor(15, 23, 42)
                
                doc.add_paragraph(f"In this Prospectus, unless the context otherwise requires, the terms defined below shall have the following meanings for {merged.get('company_acronym', '[Company Acronym]')}:")
                
                def_table = doc.add_table(rows=4, cols=2)
                def_table.alignment = WD_TABLE_ALIGNMENT.CENTER
                defs = [
                    ("Company / Issuer", merged.get("company_name", "[Company Name]")),
                    ("SEBI", "Securities and Exchange Board of India"),
                    ("ROC", "Registrar of Companies"),
                    ("Prospectus", "This Draft Red Herring Prospectus filed for the SME IPO")
                ]
                for idx, (term, meaning) in enumerate(defs):
                    r_cells = def_table.rows[idx].cells
                    r_cells[0].text = term
                    r_cells[0].paragraphs[0].runs[0].font.bold = True
                    r_cells[1].text = meaning
                    set_cell_margins(r_cells[0], 80, 80, 100, 100)
                    set_cell_margins(r_cells[1], 80, 80, 100, 100)
                doc.add_paragraph("\n")
            continue

        # Add section heading (counter increments only for sections that are rendered)
        sec_counter += 1
        h = doc.add_paragraph()
        r = h.add_run(f"{sec_counter}. {sec_name.upper()}")
        r.font.size = Pt(14)
        r.font.bold = True
        r.font.color.rgb = RGBColor(15, 23, 42)

        # Check section completeness status
        missing_fields = []
        for field in sec.get("fields", []):
            if field.get("required", False) and (merged.get(field["key"]) is None or str(merged.get(field["key"])).strip() == ""):
                missing_fields.append(field["label"])

        # Display warning placeholder if section is incomplete
        if missing_fields:
            warn_p = doc.add_paragraph()
            r_warn = warn_p.add_run(f"[SECTION INCOMPLETE - Missing required details: {', '.join(missing_fields)}]")
            r_warn.font.color.rgb = RGBColor(220, 38, 38)
            r_warn.font.bold = True
            doc.add_paragraph("\n")
            continue

        # Section-specific generation logic
        if sec_id == "risk_factors":
            doc.add_paragraph("Investment in equity shares involves a high degree of risk. Prospective investors should carefully consider all the information in this Prospectus, including the risks described below:")
            narrative = generate_narrative_text("risk_factors", merged, "internal and external risks narrative")
            doc.add_paragraph(narrative)
            doc.add_paragraph("\n")

        elif sec_id == "summary_offer":
            doc.add_paragraph(merged.get("summary_business_note", "No business summary provided."))
            doc.add_paragraph(f"The issuer is offering equity shares with an aggregate issue size of ₹ {merged.get('issue_size', '[Size]')} Crores managed by {merged.get('lead_manager', '[Lead Manager]')}.")
            doc.add_paragraph("\n")

        elif sec_id == "general_info":
            info_table = doc.add_table(rows=6, cols=2)
            info_table.alignment = WD_TABLE_ALIGNMENT.CENTER
            info_rows = [
                ("Corporate Identification Number", merged.get("cin", "")),
                ("Registered Office", merged.get("registered_office", "")),
                ("Date of Incorporation", merged.get("incorporation_date", "")),
                ("Company Type", merged.get("company_type", "")),
                ("Statutory Auditor", merged.get("auditor_name", "")),
                ("ICAI Registration/Membership", merged.get("auditor_membership", ""))
            ]
            for idx, (label, val) in enumerate(info_rows):
                row_cells = info_table.rows[idx].cells
                row_cells[0].text = label
                row_cells[0].paragraphs[0].runs[0].font.bold = True
                row_cells[1].text = str(val)
                set_cell_margins(row_cells[0], 80, 80, 100, 100)
                set_cell_margins(row_cells[1], 80, 80, 100, 100)
            doc.add_paragraph("\n")

        elif sec_id == "capital_structure":
            cap_table = doc.add_table(rows=4, cols=2)
            cap_table.alignment = WD_TABLE_ALIGNMENT.CENTER
            cap_rows = [
                ("Authorized Share Capital", f"₹ {merged.get('authorized_capital', '')}"),
                ("Pre-Issue Paid-up Capital", f"₹ {merged.get('paid_up_capital_pre', '')}"),
                ("Pre-Issue Promoter Shareholding", f"{merged.get('promoter_shareholding_pre_pct', '')} %"),
                ("Post-Issue Promoter Shareholding", "To be updated post pricing")
            ]
            for idx, (label, val) in enumerate(cap_rows):
                row_cells = cap_table.rows[idx].cells
                row_cells[0].text = label
                row_cells[0].paragraphs[0].runs[0].font.bold = True
                row_cells[1].text = str(val)
                set_cell_margins(row_cells[0], 80, 80, 100, 100)
                set_cell_margins(row_cells[1], 80, 80, 100, 100)
            doc.add_paragraph("\n")

        elif sec_id == "objects_issue":
            doc.add_paragraph("The net proceeds of the Issue are proposed to be utilized for the following requirements:")
            obj_table = doc.add_table(rows=6, cols=2)
            obj_table.alignment = WD_TABLE_ALIGNMENT.CENTER
            obj_rows = [
                ("Capital Expansion / CAPEX", f"₹ {merged.get('expansion_amount', '0')} Crores"),
                ("Working Capital Support", f"₹ {merged.get('working_capital_amount', '0')} Crores"),
                ("Debt Repayment", f"₹ {merged.get('debt_repayment_amount', '0')} Crores"),
                ("General Corporate Purposes", f"₹ {merged.get('general_corp_amount', '0')} Crores"),
                ("Issue Related Expenses", f"₹ {merged.get('issue_expenses', '0')} Crores"),
                ("Total Estimated Outlay", f"₹ {float(merged.get('expansion_amount') or 0) + float(merged.get('working_capital_amount') or 0) + float(merged.get('debt_repayment_amount') or 0) + float(merged.get('general_corp_amount') or 0) + float(merged.get('issue_expenses') or 0)} Crores")
            ]
            for idx, (label, val) in enumerate(obj_rows):
                row_cells = obj_table.rows[idx].cells
                row_cells[0].text = label
                if row_cells[0].paragraphs[0].runs:
                    row_cells[0].paragraphs[0].runs[0].font.bold = True
                row_cells[1].text = str(val)
                set_cell_margins(row_cells[0], 80, 80, 100, 100)
                set_cell_margins(row_cells[1], 80, 80, 100, 100)
                if idx == 5:
                    if row_cells[0].paragraphs[0].runs:
                        row_cells[0].paragraphs[0].runs[0].font.color.rgb = RGBColor(2, 115, 202)
                    if row_cells[1].paragraphs[0].runs:
                        row_cells[1].paragraphs[0].runs[0].font.bold = True
            doc.add_paragraph("\n")

        elif sec_id == "business_overview":
            narrative = generate_narrative_text("business_overview", merged, "detailed products, services, model overview")
            doc.add_paragraph(narrative)
            doc.add_paragraph("\n")

        elif sec_id == "industry_overview":
            narrative = generate_narrative_text("industry_overview", merged, "industry size, trends, landscape")
            doc.add_paragraph(narrative)
            doc.add_paragraph("\n")

        elif sec_id == "management":
            doc.add_paragraph(f"Promoters of the company: {merged.get('promoters_names', '[Names]')}")
            doc.add_paragraph(f"Board of Directors: {merged.get('directors_names', '[Names]')}")
            doc.add_paragraph("Promoters Key Experience:")
            doc.add_paragraph(merged.get("promoter_experience", "Experience summary not provided."))
            doc.add_paragraph("\n")

        elif sec_id == "rpt":
            doc.add_paragraph("A list of transactions entered with related parties over the last three financial years is detailed below:")
            doc.add_paragraph(merged.get("rpt_declared", "None declared."))
            doc.add_paragraph("\n")

        elif sec_id == "financials":
            doc.add_paragraph("Summary Restated Financial Performance details derived from auditor report:")
            fin_table = doc.add_table(rows=4, cols=2)
            fin_table.alignment = WD_TABLE_ALIGNMENT.CENTER
            fin_rows = [
                ("Years reported", merged.get("fy_years", "")),
                ("Latest Year Revenue", f"₹ {merged.get('revenue_fy_latest', '')} Crores"),
                ("Latest Year Profit After Tax (PAT)", f"₹ {merged.get('pat_fy_latest', '')} Crores"),
                ("Total Outstanding Borrowings", f"₹ {merged.get('borrowings_latest', '')} Crores")
            ]
            for idx, (label, val) in enumerate(fin_rows):
                row_cells = fin_table.rows[idx].cells
                row_cells[0].text = label
                row_cells[0].paragraphs[0].runs[0].font.bold = True
                row_cells[1].text = str(val)
                set_cell_margins(row_cells[0], 80, 80, 100, 100)
                set_cell_margins(row_cells[1], 80, 80, 100, 100)
            doc.add_paragraph("\n")

        elif sec_id == "legal_disclosures":
            doc.add_paragraph(f"Litigations against company: {merged.get('litigations_company', 'None')}")
            doc.add_paragraph(f"Litigations against promoters: {merged.get('litigations_promoters', 'None')}")
            doc.add_paragraph("\n")

        elif sec_id == "compliance_certs":
            comp_table = doc.add_table(rows=3, cols=2)
            comp_table.alignment = WD_TABLE_ALIGNMENT.CENTER
            comp_rows = [
                ("GSTIN", merged.get("gstin", "")),
                ("PAN", merged.get("pan", "")),
                ("GST Declared Annual Turnover", f"₹ {merged.get('gst_annual_turnover', '')} Crores")
            ]
            for idx, (label, val) in enumerate(comp_rows):
                row_cells = comp_table.rows[idx].cells
                row_cells[0].text = label
                row_cells[0].paragraphs[0].runs[0].font.bold = True
                row_cells[1].text = str(val)
                set_cell_margins(row_cells[0], 80, 80, 100, 100)
                set_cell_margins(row_cells[1], 80, 80, 100, 100)
            doc.add_paragraph("\n")

        elif sec_id == "material_contracts":
            doc.add_paragraph("The list of material contracts and files available for inspection:")
            doc.add_paragraph(merged.get("material_contracts_desc", "None registered."))
            doc.add_paragraph("\n")

        elif sec_id == "declaration":
            doc.add_paragraph("We hereby declare that all relevant provisions of the Companies Act, 2013 and the guidelines issued by the Government of India or the regulations issued by the Securities and Exchange Board of India (SEBI) have been complied with and no statement made in this Prospectus is contrary to the provisions of the Act or Rules.")
            doc.add_paragraph(f"Declaration signed status: {'Signed by Board' if merged.get('declaration_signed') == True or str(merged.get('declaration_signed')).lower() == 'true' else 'Unsigned'}")
            doc.add_paragraph("\n")

    # Save document
    doc.save(output_path)
    logger.info(f"Prospectus successfully generated and saved to {output_path}")
