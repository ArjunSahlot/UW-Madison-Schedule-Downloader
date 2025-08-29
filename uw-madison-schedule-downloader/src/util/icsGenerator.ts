import { uid } from "uid";

import type { ClassEvent, ExamEvent, FirstWeekEvent } from "./scheduleTypes";

export class ICSGenerator {
  private userTimeZone: string;

  constructor() {
    this.userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  getDayCode(dayOfWeek: number): string {
    const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    return days[dayOfWeek];
  }

  findFirstOccurrence(dayOfWeek: number, startDate: Date): Date {
    const result = new Date(startDate);
    const daysToAdd = (dayOfWeek - startDate.getDay() + 7) % 7;
    result.setDate(result.getDate() + daysToAdd);
    return result;
  }

  groupClassesByTimeSlot(classEvents: ClassEvent[]): Map<string, ClassEvent[]> {
    const groupedClasses = new Map<string, ClassEvent[]>();
    
    for (const event of classEvents) {
      const key = `${event.summary}-${event.start.getHours()}-${event.start.getMinutes()}`;
      if (!groupedClasses.has(key)) {
        groupedClasses.set(key, []);
      }
      groupedClasses.get(key)!.push(event);
    }

    return groupedClasses;
  }

  getFirstWeekEvents(
    classEvents: ClassEvent[], 
    semesterStart: Date, 
    firstWeekEnd: Date
  ): FirstWeekEvent[] {
    const firstWeekEvents: FirstWeekEvent[] = [];
    
    for (const event of classEvents) {
      const firstOccurrence = this.findFirstOccurrence(event.dayOfWeek, semesterStart);
      const eventDateTime = new Date(firstOccurrence);
      eventDateTime.setHours(event.start.getHours(), event.start.getMinutes(), 0, 0);
      
      if (eventDateTime <= firstWeekEnd) {
        firstWeekEvents.push({
          ...event,
          actualStart: eventDateTime,
          actualEnd: new Date(eventDateTime.getTime() + (event.end.getTime() - event.start.getTime()))
        });
      }
    }

    return firstWeekEvents;
  }

  generateICS(
    firstWeekEvents: FirstWeekEvent[],
    groupedClasses: Map<string, ClassEvent[]>,
    examEvents: ExamEvent[],
    semesterStart: Date,
    semesterEnd: Date,
    breakDates: Set<string>
  ): string {
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//UW Madison Schedule Downloader//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];

    // Add first week individual events
    for (const event of firstWeekEvents) {
      icsLines.push(
        'BEGIN:VEVENT',
        `UID:${uid()}`,
        `DTSTAMP:${this.formatDateTime(new Date())}`,
        `DTSTART;TZID=${this.userTimeZone}:${this.formatDateTime(event.actualStart)}`,
        `DTEND;TZID=${this.userTimeZone}:${this.formatDateTime(event.actualEnd)}`,
        `SUMMARY:${event.summary}`,
        `DESCRIPTION:${event.description}`,
        `LOCATION:${event.location}`,
        'END:VEVENT'
      );
    }

    // Add recurring class events
    const firstWeekEnd = new Date(semesterStart);
    const daysToSaturday = (6 - semesterStart.getDay() + 7) % 7;
    firstWeekEnd.setDate(firstWeekEnd.getDate() + daysToSaturday);
    firstWeekEnd.setHours(23, 59, 59, 999);

    for (const [key, events] of groupedClasses) {
      const sampleEvent = events[0];
      const allDays = [...new Set(events.map(e => this.getDayCode(e.dayOfWeek)))].sort();
      const daysList = allDays.join(',');
      
      const secondWeekStart = new Date(firstWeekEnd);
      secondWeekStart.setDate(secondWeekStart.getDate() + 1);
      
      const earliestDayOfWeek = Math.min(...events.map(e => e.dayOfWeek));
      const secondWeekOccurrence = this.findFirstOccurrence(earliestDayOfWeek, secondWeekStart);
      
      const startDateTime = new Date(secondWeekOccurrence);
      startDateTime.setHours(sampleEvent.start.getHours(), sampleEvent.start.getMinutes(), 0, 0);
      
      const endDateTime = new Date(secondWeekOccurrence);
      endDateTime.setHours(sampleEvent.end.getHours(), sampleEvent.end.getMinutes(), 0, 0);

      const extendedSemesterEnd = new Date(semesterEnd);
      extendedSemesterEnd.setHours(23, 59, 59, 999);

      icsLines.push(
        'BEGIN:VEVENT',
        `UID:${sampleEvent.uid}`,
        `DTSTAMP:${this.formatDateTime(new Date())}`,
        `DTSTART;TZID=${this.userTimeZone}:${this.formatDateTime(startDateTime)}`,
        `DTEND;TZID=${this.userTimeZone}:${this.formatDateTime(endDateTime)}`,
        `SUMMARY:${sampleEvent.summary}`,
        `DESCRIPTION:${sampleEvent.description}`,
        `LOCATION:${sampleEvent.location}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${daysList};UNTIL=${this.formatDateTime(extendedSemesterEnd)}`
      );

      // Add break exceptions
      if (breakDates.size > 0) {
        const exceptionDateTimes: string[] = [];
        
        for (const event of events) {
          const dayOfWeek = event.dayOfWeek;
          let currentDate = this.findFirstOccurrence(dayOfWeek, secondWeekStart);
          currentDate.setHours(sampleEvent.start.getHours(), sampleEvent.start.getMinutes(), 0, 0);
          
          while (currentDate <= extendedSemesterEnd) {
            const dateStr = this.formatDate(currentDate);
            if (breakDates.has(dateStr)) {
              exceptionDateTimes.push(this.formatDateTime(currentDate));
            }
            currentDate.setDate(currentDate.getDate() + 7);
          }
        }
        
        const uniqueExceptions = [...new Set(exceptionDateTimes)].sort();
        if (uniqueExceptions.length > 0) {
          icsLines.push(`EXDATE;TZID=${this.userTimeZone}:${uniqueExceptions.join(',')}`);
        }
      }

      icsLines.push('END:VEVENT');
    }

    // Add exam events
    for (const exam of examEvents) {
      icsLines.push(
        'BEGIN:VEVENT',
        `UID:${exam.uid}`,
        `DTSTAMP:${this.formatDateTime(new Date())}`,
        `DTSTART;TZID=${this.userTimeZone}:${this.formatDateTime(exam.start)}`,
        `DTEND;TZID=${this.userTimeZone}:${this.formatDateTime(exam.end)}`,
        `SUMMARY:${exam.summary}`,
        `DESCRIPTION:${exam.description}`,
        `LOCATION:${exam.location}`,
        'END:VEVENT'
      );
    }

    icsLines.push('END:VCALENDAR');
    return icsLines.join('\r\n');
  }
}
