export const downloadText = (content: string, filename: string, type: string): void => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const csvCell = (value: unknown): string => `"${String(value ?? '').replaceAll('"', '""')}"`;
export const toCsv = (rows: unknown[][]): string =>
  `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`;

export const toIcs = (
  events: Array<{ date: string; title: string; description?: string }>,
): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//K2 EnerjiPro//TR',
    ...events.flatMap((event, index) => [
      'BEGIN:VEVENT',
      `UID:k2-${index}-${event.date.replaceAll('-', '')}@energipro`,
      `DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`,
      `SUMMARY:${event.title.replaceAll('\n', ' ')}`,
      `DESCRIPTION:${(event.description ?? '').replaceAll('\n', ' ')}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n');
