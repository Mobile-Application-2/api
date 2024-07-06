import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function generate_pdf(records: any[]): string {
  if (!records.length) {
    return '';
  }

  const doc = new jsPDF();
  const headers = Object.keys(records[0]);
  const tableData = records.map(record => Object.values(record));

  autoTable(doc, {
    head: [headers],
    body: tableData as any,
    startY: 20,
    theme: 'striped', // Choose from 'striped', 'grid', 'plain'
    columnStyles: {
      0: {cellWidth: 30},
      1: {cellWidth: 40} /* Adjust widths as needed */,
    },
  });

  return doc.output('datauristring');
}
