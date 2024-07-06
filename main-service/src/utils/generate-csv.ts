export default function generate_csv(records: any[]): string {
  let str = '';

  if (!records.length) {
    return str;
  }

  const headers = Object.keys(records[0]).join(',').concat('\n');
  str = str.concat(headers);
  records.forEach(record => {
    const values = Object.values(record).join(',').concat('\n');
    str = str.concat(values);
  });

  return str;
}
