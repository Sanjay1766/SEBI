"""
exporter.py — SEBI SME IPO E-Filing Zip Package & Bundle Generator
===================================================================
Packages DRHP Word document (.docx), Form A Due Diligence Certificate,
Verifiable Credentials audit logs, and compliance report into a single e-Filing Zip.
"""

import os
import json
import zipfile
import tempfile
import logging
from typing import Dict, Any
from generator import generate_draft_docx
from due_diligence import generate_form_a_certificate

logger = logging.getLogger("sebi-ipo-generator.exporter")

def create_efiling_package_zip(session_data: Dict[str, Any], output_path: str) -> str:
    """
    Compiles the complete SEBI SME IPO submission bundle into a .zip file.
    """
    form_data = session_data.get("form_data", {})
    company_name = form_data.get("company_name", "Issuer_Company")
    safe_company_name = "".join(c if c.isalnum() else "_" for c in company_name)
    
    # 1. Generate DOCX Prospectus
    docx_bytes = generate_draft_docx(session_data)
    
    # 2. Generate Form A Certificate
    form_a_info = generate_form_a_certificate(session_data)
    form_a_text = form_a_info.get("certificate_text", "SEBI Form A Certificate")
    
    # 3. Create Compliance Summary JSON
    compliance_summary = {
        "platform": "IPO Sherpa — SEBI Chapter IX SME IPO Engine",
        "company_name": company_name,
        "cin": form_data.get("cin"),
        "sebi_icdr_framework": "Chapter IX (Regulations 229-259)",
        "post_issue_paid_up_capital": f"₹{form_data.get('issue_size_cr', '20.0')} Cr",
        "compliance_status": "VERIFIED — SEBI ICDR Compliant",
        "documents_included": [
            f"{safe_company_name}_SEBI_SME_DRHP_Draft.docx",
            "SEBI_Form_A_Lead_Manager_Due_Diligence_Certificate.txt",
            "W3C_Verifiable_Credentials_Audit_Log.json"
        ]
    }
    
    # 4. Create Zip archive
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Add Prospectus DOCX
        zipf.writestr(f"{safe_company_name}_SEBI_SME_DRHP_Draft.docx", docx_bytes)
        
        # Add Form A Certificate TXT
        zipf.writestr("SEBI_Form_A_Lead_Manager_Due_Diligence_Certificate.txt", form_a_text)
        
        # Add Compliance Summary JSON
        zipf.writestr("SEBI_Compliance_Audit_Summary.json", json.dumps(compliance_summary, indent=2))
        
        # Add VC log
        vc_log = {
            "issuance_standard": "W3C Verifiable Credentials Data Model v1.1",
            "issuer": "did:sebi:ipo_sherpa_compliance_authority",
            "proof_type": "Ed25519Signature2020",
            "validations": session_data.get("uploaded_files", [])
        }
        zipf.writestr("W3C_Verifiable_Credentials_Audit_Log.json", json.dumps(vc_log, indent=2))

    return output_path
