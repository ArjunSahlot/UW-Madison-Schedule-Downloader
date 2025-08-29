import type { Break } from "./scheduleTypes";

export function processBreaks(breaks: Break[]): {
  semesterStart: Date;
  semesterEnd: Date;
  breakDates: Set<string>;
} {
  let semesterStart: Date;
  let semesterEnd: Date;
  const breakDates: Set<string> = new Set();

  if (breaks.length > 0) {
    semesterStart = new Date(breaks[0].date);
    semesterEnd = new Date(breaks[breaks.length - 1].date);
    
    // Get all break dates (excluding start/end)
    for (let i = 1; i < breaks.length - 1; i++) {
      const breakStart = new Date(breaks[i].date);
      const breakLength = breaks[i].length;
      
      for (let j = 0; j < breakLength; j++) {
        const breakDate = new Date(breakStart);
        breakDate.setDate(breakDate.getDate() + j);
        // Store dates as YYYYMMDD strings for easier comparison
        const dateStr = breakDate.getFullYear() + 
                       String(breakDate.getMonth() + 1).padStart(2, '0') + 
                       String(breakDate.getDate()).padStart(2, '0');
        breakDates.add(dateStr);
      }
    }
  } else {
    semesterStart = new Date();
    semesterEnd = new Date();
    semesterEnd.setFullYear(semesterEnd.getFullYear() + 1);
  }

  return { semesterStart, semesterEnd, breakDates };
}
