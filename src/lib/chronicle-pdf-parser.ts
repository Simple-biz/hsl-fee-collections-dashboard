// Chronicle PDF Parser
// Extracts structured data from the Chronicle "all_file" combined PDF
// Fields extracted: full SSN, diagnoses, fee method/cap, DLI, rep info,
// claimant contact, firm info, hearing office, decision history
// ============================================================================

export interface PdfExtractedData {
  fullSsn: string | null;
  fullName: string | null;
  dob: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;

  primaryDiagnosis: string | null;
  primaryDiagnosisCode: string | null;
  secondaryDiagnosis: string | null;
  secondaryDiagnosisCode: string | null;
  allegations: string | null;

  feeMethod: "fee_agreement" | "fee_petition" | null;
  feeCapAtSigning: number | null;
  feeAgreementDate: string | null;

  dateLastInsured: string | null;
  blindDli: string | null;

  representatives: {
    name: string;
    repId: string | null;
  }[];

  firmName: string | null;
  firmEin: string | null;

  hearingOffice: string | null;

  decisionHistory: {
    level: string;
    claimType: string;
    result: string;
    date: string | null;
  }[];

  totalPages: number;
  parsedAt: string;
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

function extractFromCoverPage(text: string) {
  const ssn = text.match(/SSN[:\s]*(\d{3}-\d{2}-\d{4})/)?.[1] ?? null;
  const nameMatch =
    text.match(/Claimant[:\s]*([A-Za-z][A-Za-z\s'-]+)/)?.[1]?.trim() ?? null;
  const name = nameMatch?.split("\n")[0].trim() ?? null;
  const dli =
    text.match(/Last Insured[:\s]*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null;
  return { ssn, name, dli };
}

function extractDiagnoses(rawText: string) {
  const result = {
    primary: null as string | null,
    primaryCode: null as string | null,
    secondary: null as string | null,
    secondaryCode: null as string | null,
  };

  // Pattern from real PDF text extraction:
  // "Obesity\n202780\nDermatitis\n6960"
  // Body system code (20) is prepended to the diagnosis code (2780)
  const dxPattern =
    /DLI:[\s\S]*?AOD:[\s\S]*?\n(?:.*?\n)*?([A-Z][a-z]+[\w\s]*?)\n(\d{2,})(\d{4})\n([A-Z][a-z]+[\w\s]*?)\n(\d{4})/;
  const match = rawText.match(dxPattern);
  if (match) {
    result.primary = match[1].trim();
    result.primaryCode = match[3];
    result.secondary = match[4].trim();
    result.secondaryCode = match[5];
  } else {
    // Broader fallback
    const dxAlt = rawText.match(
      /([A-Z][a-z]{2,}(?:\s+[a-z]+)*)\n\d{1,2}(\d{4})\n([A-Z][a-z]{2,}(?:\s+[a-z]+)*)\n(\d{4})/,
    );
    if (dxAlt) {
      result.primary = dxAlt[1].trim();
      result.primaryCode = dxAlt[2];
      result.secondary = dxAlt[3].trim();
      result.secondaryCode = dxAlt[4];
    }
  }

  return result;
}

function extractDli(rawText: string) {
  const dli = rawText.match(/DLI[:\s]*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null;
  const blindDli =
    rawText.match(/Blind DLI[:\s]*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null;
  return { dli, blindDli };
}

function extractFeeInfo(rawText: string) {
  let method: "fee_agreement" | "fee_petition" | null = null;
  let cap: number | null = null;
  let date: string | null = null;

  if (rawText.includes("Fee Agreement for Representation")) {
    method = "fee_agreement";

    const capMatch = rawText.match(
      /current maximum is \$?([\d,]+(?:\.\d{2})?)/i,
    );
    if (capMatch) {
      cap = parseFloat(capMatch[1].replace(/,/g, ""));
    }

    // Date from TOC: "FEEAGRMT04/10/20253"
    const dateMatch = rawText.match(/FEEAGRMT(\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch) date = dateMatch[1];
  } else if (rawText.includes("Fee Petition")) {
    method = "fee_petition";
  }

  return { method, cap, date };
}

function extractRepresentatives(rawText: string) {
  // Extract unique Rep IDs (spaced: "H W T T C D C P 4 J")
  const repIds = new Set<string>();
  const repIdRegex = /Rep ID[\s\n]*([A-Z0-9](?:\s+[A-Z0-9]){9})/gi;
  let match;
  while ((match = repIdRegex.exec(rawText)) !== null) {
    const id = match[1].replace(/\s+/g, "");
    if (id.length === 10) repIds.add(id);
  }

  // Extract rep names from SSA-1696 sections
  const repNames = new Set<string>();
  const sections = rawText
    .split("Back to top")
    .filter((t) => t.includes("Appointment of a Representative"));

  for (const s of sections) {
    const namePatterns = [
      /Section 2[\s\S]*?First Name[\s\S]*?Last Name[\s\S]*?Suffix\s*\n\s*([A-Z][A-Za-z\s,.']+)/,
      /My representative is[:\s]*\n?\s*([A-Z][A-Za-z\s,.']+)/,
    ];

    for (const pattern of namePatterns) {
      const m = s.match(pattern);
      if (m) {
        const name = m[1].split("\n")[0].trim();
        if (
          name.length > 3 &&
          !name.includes("Section") &&
          !name.includes("Part")
        ) {
          repNames.add(name);
          break;
        }
      }
    }
  }

  const idArray = [...repIds];
  const nameArray = [...repNames];
  const reps: PdfExtractedData["representatives"] = [];
  const maxLen = Math.max(idArray.length, nameArray.length);

  for (let i = 0; i < maxLen; i++) {
    reps.push({
      name: nameArray[i] ?? `Representative ${i + 1}`,
      repId: idArray[i] ?? null,
    });
  }

  return reps;
}

function extractFirmInfo(rawText: string) {
  let name: string | null = null;
  let ein: string | null = null;

  const firmMatch = rawText.match(
    /Entity's Name[\s\S]*?(?:this\s+claim\))\s*\n\s*([A-Z][A-Z\s.,]+(?:PA|P\.A\.|LLC|PLLC|Inc|P\.C\.))/i,
  );
  if (firmMatch) {
    name = firmMatch[1].split("\n")[0].trim();
  }

  // EIN: spaced digits with dash "5 9 - 3 6 4 0 3 2 6"
  const einMatch = rawText.match(
    /EIN\s*\n\s*(\d)\s*(\d)\s*-\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)/,
  );
  if (einMatch) {
    ein = `${einMatch[1]}${einMatch[2]}-${einMatch[3]}${einMatch[4]}${einMatch[5]}${einMatch[6]}${einMatch[7]}${einMatch[8]}${einMatch[9]}`;
  }

  return { name, ein };
}

function extractContactInfo(rawText: string) {
  const email =
    rawText.match(
      /(?:Email(?:\s+Address)?)[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    )?.[1] ?? null;

  const phone = rawText.match(
    /(?:Daytime Phone|Phone number)[:\s]*\(?(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})/i,
  );
  const phoneStr = phone ? `(${phone[1]}) ${phone[2]}-${phone[3]}` : null;

  return { phone: phoneStr, email };
}

function extractDob(rawText: string): string | null {
  const dobMatch = rawText.match(
    /(?:DOB|Date of Birth)[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (dobMatch) return dobMatch[1];

  const writtenMatch = rawText.match(/DATE OF BIRTH IS (\w+ \d{1,2}, \d{4})/);
  if (writtenMatch) return writtenMatch[1];

  return null;
}

function extractDecisionHistory(rawText: string) {
  const decisions: PdfExtractedData["decisionHistory"] = [];
  const seen = new Set<string>();

  const sections = rawText
    .split("Back to top")
    .filter((t) => t.includes("Disability Determination Explanation"));

  for (const s of sections) {
    const decMatch = s.match(/(Not Disabled|Partially Favorable|Disabled)/i);
    const levelMatch = s.match(/(Initial|Recon(?:sideration)?)/i);
    const typeMatch = s.match(
      /(?:for the\s+)?(DIB|DI|T2|T16|SSI|Title II|Title XVI)/i,
    );
    const dateMatch = s.match(/Dec Dt[:\s]*(\d{2}\/\d{2}\/\d{4})/);

    if (decMatch && levelMatch) {
      const level = levelMatch[1].toLowerCase().startsWith("recon")
        ? "Reconsideration"
        : "Initial";
      const claimType = (typeMatch?.[1] ?? "Unknown").toUpperCase();
      const result = decMatch[1].includes("Not")
        ? "Not Disabled"
        : decMatch[1].includes("Partially")
          ? "Partially Favorable"
          : "Disabled";
      const date = dateMatch?.[1] ?? null;
      const key = `${level}-${claimType}-${date}`;

      if (!seen.has(key)) {
        seen.add(key);
        decisions.push({ level, claimType, result, date });
      }
    }
  }

  return decisions;
}

function extractAllegations(rawText: string): string | null {
  const match = rawText.match(
    /disability due to the following[\s\S]*?:\s*\n\s*([\s\S]+?)(?:\n\s*(?:The individual|We have))/i,
  );
  if (match) {
    return match[1].replace(/\n\s*/g, " ").trim();
  }
  return null;
}

function extractHearingOffice(rawText: string): string | null {
  const ohoMatch = rawText.match(/SSA OHO HEARING OFC\s*\n\s*([\w\s,]+)/i);
  if (ohoMatch) return ohoMatch[1].split("\n")[0].trim();

  const cityMatch = rawText.match(/(\w+(?:,\s*\w+)?)\s+OHO/i);
  if (cityMatch) return `${cityMatch[1]} OHO`;

  return null;
}

// ============================================================================
// MAIN PARSER
// ============================================================================

export function parseChronicleAllFile(
  rawText: string,
  totalPages: number,
): PdfExtractedData {
  const cover = extractFromCoverPage(rawText);
  const diagnoses = extractDiagnoses(rawText);
  const dliInfo = extractDli(rawText);
  const feeInfo = extractFeeInfo(rawText);
  const representatives = extractRepresentatives(rawText);
  const firmInfo = extractFirmInfo(rawText);
  const contactInfo = extractContactInfo(rawText);
  const dob = extractDob(rawText);
  const allegations = extractAllegations(rawText);
  const decisionHistory = extractDecisionHistory(rawText);
  const hearingOffice = extractHearingOffice(rawText);

  return {
    fullSsn: cover.ssn,
    fullName: cover.name,
    dob,
    address: null, // Address extraction is unreliable from PDF text — better from API/intake
    phone: contactInfo.phone,
    email: contactInfo.email,
    primaryDiagnosis: diagnoses.primary,
    primaryDiagnosisCode: diagnoses.primaryCode,
    secondaryDiagnosis: diagnoses.secondary,
    secondaryDiagnosisCode: diagnoses.secondaryCode,
    allegations,
    feeMethod: feeInfo.method,
    feeCapAtSigning: feeInfo.cap,
    feeAgreementDate: feeInfo.date,
    dateLastInsured: dliInfo.dli ?? cover.dli,
    blindDli: dliInfo.blindDli,
    representatives,
    firmName: firmInfo.name,
    firmEin: firmInfo.ein,
    hearingOffice,
    decisionHistory,
    totalPages,
    parsedAt: new Date().toISOString(),
  };
}
