// script.js

const form = document.getElementById('loiForm');
const fileInput = document.getElementById('fileInput');
const spinner = document.getElementById('spinner');
const debugConsole = document.getElementById('debugConsole');
const jsonOutput = document.getElementById('jsonOutput');
const preview = document.getElementById('preview');

// Auto-fill today's date
const dateField = document.getElementById('dateField');
if (dateField) {
  dateField.value = new Date().toISOString().split('T')[0];
}

const endpoint = "https://bldataextractor1.cognitiveservices.azure.com/";
const apiKey = "3ced498fc6a24e01ab8be5992d41c2d1";
const modelId = "BLDataExtractorPass2";

async function analyzeDocument() {
  const file = fileInput.files[0];
  if (!file) return alert("Please upload a file first.");

  spinner.style.display = 'inline-block';
  debugConsole.textContent = "Uploading and analyzing...";
  jsonOutput.textContent = "";

  try {
    const url = `${endpoint}formrecognizer/documentModels/${modelId}:analyze?api-version=2023-07-31`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'Ocp-Apim-Subscription-Key': apiKey
      },
      body: file
    });

    const operationLocation = response.headers.get('operation-location');
    if (!operationLocation) throw new Error("Missing operation-location header.");

    debugConsole.textContent = `Polling analysis...\n`;
    let result;
    for (let i = 0; i < 15; i++) {
      debugConsole.textContent += `Attempt ${i + 1}...\n`;
      await new Promise(res => setTimeout(res, 3000));
      const pollRes = await fetch(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': apiKey }
      });
      const pollJson = await pollRes.json();

      debugConsole.textContent += `Status: ${pollJson.status}\n`;

      if (pollJson.status === "succeeded") {
        result = pollJson.analyzeResult;
        break;
      } else if (pollJson.status === "failed") {
        throw new Error("Document analysis failed.\n" + JSON.stringify(pollJson, null, 2));
      }
    }

    if (!result) throw new Error("Document analysis failed. See debug console for details.");

    jsonOutput.textContent = JSON.stringify(result, null, 2);
    applyExtraction(result.documents[0].fields);
  } catch (err) {
    alert("Document analysis failed. See debug console for details.");
    debugConsole.textContent += `\nERROR: ${err.message}`;
  } finally {
    spinner.style.display = 'none';
  }
}

function applyExtraction(fields) {
  const mapping = {
    shipperName: 'ShipperName',
    consigneeName: 'ConsigneeName',
    vesselName: 'ShipName',
    portLoading: 'LoadPort',
    portDischarge: 'DischargePort',
    requestorName: 'ShipperName',
    deliveryName: 'ConsigneeName',
    cargoDescription: (f) => `${f.CargoQty?.content || ''} ${f.CargoDescription?.content || ''}`.trim(),
    billDetails: (f) => `[BL Number] dated ${f.BLDate?.content || ''} in ${f.LoadPort?.content || ''}`
  };

  Object.entries(mapping).forEach(([formKey, fieldKey]) => {
    const input = form[formKey];
    const wrapper = input.closest('.overlap-group');
    if (!input || !wrapper) return;

    let value = "";
    let confidence = null;

    if (typeof fieldKey === 'function') {
      value = fieldKey(fields);
    } else if (fields[fieldKey]) {
      value = fields[fieldKey].content;
      confidence = fields[fieldKey].confidence;
    }

    if (value) {
      input.value = value;
      wrapper.classList.add('autofilled');

      if (confidence !== null) {
        const indicator = document.createElement('div');
        indicator.className = 'confidence-indicator';

        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.title = `Confidence: ${Math.round(confidence * 100)}%`;

        if (confidence >= 0.8) dot.classList.add('green');
        else if (confidence >= 0.5) dot.classList.add('orange');
        else {
          dot.classList.add('red');
          wrapper.classList.add('low-confidence');
        }

        const score = document.createElement('span');
        score.textContent = `${Math.round(confidence * 100)}%`;

        indicator.appendChild(dot);
        indicator.appendChild(score);
        wrapper.appendChild(indicator);

        if (confidence < 0.8) {
          dot.title += confidence < 0.5
            ? "\nPlease verify this field against the Bill of Lading."
            : "\nWe recommend checking this field against the Bill of Lading.";
        }
      }
    }
  });

  updatePreview();
}

function getFormData() {
  return Object.fromEntries(new FormData(form).entries());
}

function updatePreview() {
  const d = getFormData();
  preview.textContent = `To: ${d.ownerName}
${d.date}

The Owners and/or Managers of the ${d.vesselName}
${d.ownerAddress}

Dear Sirs

Vessel: ${d.vesselName}
Port of Loading: ${d.portLoading}
Port of Discharge: ${d.portDischarge}
Cargo: ${d.cargoDescription}
Bill(s) of Lading: ${d.billDetails}

The above Cargo was shipped on the above Vessel by ${d.shipperName} and consigned to ${d.consigneeName} for delivery at the Port of Discharge but the Bill(s) of Lading is (are) not currently available to be presented.

We, ${d.requestorName}, hereby represent and undertake that ${d.deliveryName} is the party lawfully entitled to delivery of the said Cargo and request you to deliver the said Cargo to ${d.deliveryName} or to such party as you believe to be or to represent ${d.deliveryName} or to be acting on behalf of ${d.deliveryName} at ${d.deliveryPlace} without production of the original Bill(s) of Lading.

In consideration of your complying with our above request, we hereby agree as follows:

1. To indemnify you, your servants and agents and to hold all of you harmless in respect of any liability, loss, damage or expense of whatsoever nature which you may sustain by reason of delivering the Cargo in accordance with our request.

2. In the event of any proceedings being commenced against you or any of your servants or agents in connection with the delivery of the Cargo as aforesaid, to provide you or them on demand with sufficient funds to defend the same.

3. If, in connection with the delivery of the Cargo as aforesaid, the Vessel, or any other vessel or property in the same or associated ownership, management or control, or any vessel or property in your ownership, management or control, should be arrested or detained or should the arrest or detention thereof be threatened, or should there be any interference in the use or trading of the Vessel or such other vessels or property:
(a) to provide on demand such bail or other security as may be required;
(b) if you have already provided security, to provide on demand equivalent substitute or counter security; and
(c) to indemnify you in respect of any liability, loss, damage or expense caused by such arrest or detention or threatened arrest or such interference.

4. If the place at which we have asked you to make delivery is a bulk liquid, dry bulk cargo or gas terminal or other facility, or another vessel, lighter or barge, then discharge or delivery to such terminal, facility, vessel, lighter or barge shall be deemed to be delivery to the party to whom we have requested you to make such delivery.

5. As soon as all original bills of lading for the above Cargo shall have come into our possession, to deliver the same to you, whereupon (always provided that the said bills of lading have been properly tendered by the party to whom the Cargo was actually delivered) our liability hereunder shall cease.

6. The liability of each and every person under this indemnity shall be joint and several and shall not be conditional upon your proceeding first against any person.

7. This indemnity shall be governed by and construed in accordance with English law and each person liable under this indemnity submits to the exclusive jurisdiction of the High Court of Justice of England.

Yours faithfully for and on behalf of ${d.requestorName}

The Requestor
Full name ${d.signatoryFullName}
Signature ______________________________
Authorised signatory`;
}

document.addEventListener("DOMContentLoaded", () => {
  const extractBtn = document.getElementById("extractBtn");
  if (extractBtn) {
    extractBtn.addEventListener("click", analyzeDocument);
  }
});

function copyText() {
  const content = document.getElementById('preview-content');
  const text = content?.textContent || "";

  if (!text.trim()) {
    alert("Nothing to copy — the LOI preview is empty.");
    return;
  }

  navigator.clipboard.writeText(text)
    .then(() => alert("LOI text copied to clipboard."))
    .catch(err => {
      console.error("Copy failed", err);
      alert("Failed to copy text.");
    });
}

function downloadWord() {
  const content = document.getElementById('preview-content');
  if (!content || !content.textContent.trim()) {
    alert("Nothing to download — the LOI preview is empty.");
    return;
  }

  const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office'
          xmlns:w='urn:schemas-microsoft-com:office:word'
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>LOI</title></head><body>`;
  const footer = "</body></html>";
  const sourceHTML = header + "<pre>" + content.textContent + "</pre>" + footer;

  const blob = new Blob(['\ufeff', sourceHTML], {
    type: 'application/msword'
  });

  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = "Letter_of_Indemnity.doc";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}
