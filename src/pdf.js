function cleanFileName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function exportResultsPdf(elementId, title) {
  const source = document.getElementById(elementId);
  if (!source) return;

  const [{ default: html2canvas }, pdfModule] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const JsPDF = pdfModule.default || pdfModule.jsPDF;
  const canvas = await html2canvas(source, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
  });
  const pdf = new JsPDF("p", "pt", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageWidth = pageWidth - 48;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;
  const image = canvas.toDataURL("image/png");

  let heightLeft = imageHeight;
  let position = 24;

  pdf.addImage(image, "PNG", 24, position, imageWidth, imageHeight);
  heightLeft -= pageHeight - 48;

  while (heightLeft > 0) {
    pdf.addPage();
    position = heightLeft - imageHeight + 24;
    pdf.addImage(image, "PNG", 24, position, imageWidth, imageHeight);
    heightLeft -= pageHeight - 48;
  }

  pdf.save(`${cleanFileName(title || "veto-results")}-results.pdf`);
}
