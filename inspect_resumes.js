const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

async function inspectUploads() {
  console.log("=== Inspecting Uploads ===");
  
  // 1. Kabir Singh
  const pdfPath = path.join(__dirname, 'uploads', '4_Kabir_Singh_AI_Prompt_Engineer_Fresher (1).pdf');
  if (fs.existsSync(pdfPath)) {
    const buf = fs.readFileSync(pdfPath);
    const parser = new PDFParse({ data: buf });
    const res = await parser.getText();
    await parser.destroy();
    console.log("\n[1] Kabir Singh Resume Text (length: " + res.text.length + "):");
    console.log(res.text.slice(0, 500));
  }

  // 2. Sneha Verma
  const docxPath = path.join(__dirname, 'uploads', '5_Sneha_Verma_Digital_Marketing.docx');
  if (fs.existsSync(docxPath)) {
    const resDoc = await mammoth.extractRawText({ path: docxPath });
    console.log("\n[2] Sneha Verma Resume Text (length: " + resDoc.value.length + "):");
    console.log(resDoc.value.slice(0, 500));
  }
}

inspectUploads();
