import fileDownload from "js-file-download";
import { DateTime } from "luxon";
import type { PlasmoCSConfig } from "plasmo";
import { generateIcsCalendar, type VCalendar, type VEvent } from "ts-ics";
import { uid } from "uid";
import browser from "webextension-polyfill";

import { DOWNLOAD_SHED_MSG } from "~assets/constants";
import getCleanedContent from "~util/getCleanedContent";
import { parseExamDetails, parseMeetingDetails } from "~util/parseDetails";

export const config: PlasmoCSConfig = {
  matches: ["*://mumaaenroll.services.wisc.edu/courses-schedule*"]
};

interface Break {
  name: string;
  date: string; // Changed from Date to string since we're sending ISO strings
  length: number;
}

interface DownloadScheduleMessage {
  type: string;
  payload: Break[];
}

browser.runtime.onMessage.addListener((message: DownloadScheduleMessage, sender, sendResponse) => {
  if (message.type !== DOWNLOAD_SHED_MSG) return true;

  console.log("📥 Starting schedule download process");

  (async () => {
    try {
      // Parse break dates and semester boundaries
      const breaks: Break[] = message.payload;
      let semesterStart: Date;
      let semesterEnd: Date;
      let breakDates: Set<string> = new Set(); // Use Set for O(1) lookup

      if (breaks.length > 0) {
        semesterStart = new Date(breaks[0].date);
        semesterEnd = new Date(breaks[breaks.length - 1].date);
        
        console.log("🏫 Processing breaks:");
        // Get all break dates (excluding start/end)
        for (let i = 1; i < breaks.length - 1; i++) {
          const breakStart = new Date(breaks[i].date);
          const breakLength = breaks[i].length;
          
          console.log(`  📋 ${breaks[i].name}: ${breakStart.toDateString()} for ${breakLength} days`);
          
          for (let j = 0; j < breakLength; j++) {
            const breakDate = new Date(breakStart);
            breakDate.setDate(breakDate.getDate() + j);
            // Store dates as YYYYMMDD strings for easier comparison
            const dateStr = breakDate.getFullYear() + 
                           String(breakDate.getMonth() + 1).padStart(2, '0') + 
                           String(breakDate.getDate()).padStart(2, '0');
            breakDates.add(dateStr);
            console.log(`    🚫 Break date added: ${breakDate.toDateString()} (${dateStr})`);
          }
        }
      } else {
        semesterStart = new Date();
        semesterEnd = new Date();
        semesterEnd.setFullYear(semesterEnd.getFullYear() + 1);
      }

      console.log("📅 Semester:", semesterStart.toDateString(), "to", semesterEnd.toDateString());
      console.log("🚫 Total break dates:", breakDates.size);

      // Parse all courses and events
      const courses = document.querySelectorAll("#course-meetings");
      const classEvents: any[] = [];
      const examEvents: any[] = [];

      for (let i = 0; i < courses.length; i++) {
        const courseElement = courses[i];
        const fullCourse = courseElement.querySelector("h3, strong")?.textContent || "";
        
        if (!fullCourse) continue;

        const [courseTitle] = fullCourse.split(": ");
        const lists = Array.from(courseElement.querySelectorAll(":scope > ul"));
        const [meetingList, examList] = lists;

        console.log("📚 Processing course:", courseTitle);

        // Process exams with better date handling
        if (examList) {
          const exams = examList.children;
          for (let j = 0; j < exams.length; j++) {
            const examStr = exams[j].querySelector("span")?.textContent || "";
            if (!examStr) continue;
            
            try {
              const examDetails = parseExamDetails(examStr);
              
              // Ensure exam dates are valid and within a reasonable range
              const examStart = examDetails.start.toJSDate();
              const examEnd = examDetails.end.toJSDate();
              const currentYear = new Date().getFullYear();
              
              if (!isNaN(examStart.getTime()) && !isNaN(examEnd.getTime()) &&
                  examStart.getFullYear() >= currentYear && examStart.getFullYear() <= currentYear + 1 &&
                  examEnd.getFullYear() >= currentYear && examEnd.getFullYear() <= currentYear + 1) {
                examEvents.push({
                  uid: uid(),
                  summary: `${courseTitle} FINAL EXAM`,
                  description: `Final exam for ${courseTitle}`,
                  location: examDetails.location || "TBA",
                  start: examStart,
                  end: examEnd
                });
              } else {
                console.error("❌ Invalid exam dates for", courseTitle, "Start:", examStart, "End:", examEnd);
              }
            } catch (error) {
              console.error("❌ Failed to parse exam for", courseTitle, ":", error);
            }
          }
        }

        // Process regular class meetings
        if (meetingList) {
          const meetings = meetingList.children;
          for (let j = 0; j < meetings.length; j++) {
            const meetingElement = meetings[j];
            const type = meetingElement.querySelector("strong")?.textContent || "";
            const details = meetingElement.querySelector("span");

            if (!type || !details) continue;

            const detailsText = getCleanedContent(details);
            if (detailsText.toLowerCase().includes("online")) {
              continue;
            }

            try {
              const parsedDetails = parseMeetingDetails(detailsText, DateTime.fromJSDate(semesterStart));

              for (const meetingTime of parsedDetails.times) {
                const classStart = meetingTime.start.toJSDate();
                const classEnd = meetingTime.end.toJSDate();
                
                if (!isNaN(classStart.getTime()) && !isNaN(classEnd.getTime())) {
                  classEvents.push({
                    uid: uid(),
                    summary: courseTitle,
                    description: `${type} - ${courseTitle}`,
                    location: parsedDetails.location,
                    start: classStart,
                    end: classEnd,
                    dayOfWeek: classStart.getDay() // 0=Sunday, 1=Monday, etc.
                  });
                }
              }
            } catch (error) {
              console.error("❌ Failed to parse meeting for", courseTitle, ":", error);
            }
          }
        }
      }

      console.log("📊 Total events:", classEvents.length, "classes,", examEvents.length, "exams");

      // Get user's timezone
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      console.log("🌍 Using timezone:", userTimeZone);

      // Helper functions
      const formatDateTime = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}T${hours}${minutes}${seconds}`;
      };

      const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
      };

      const getDayCode = (dayOfWeek: number): string => {
        const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        return days[dayOfWeek];
      };

      // Find the first occurrence of each day of the week on or after semester start
      const findFirstOccurrence = (dayOfWeek: number, startDate: Date): Date => {
        const result = new Date(startDate);
        const daysToAdd = (dayOfWeek - startDate.getDay() + 7) % 7;
        result.setDate(result.getDate() + daysToAdd);
        return result;
      };

      // Find the end of the first week (Saturday night)
      const firstWeekEnd = new Date(semesterStart);
      const daysToSaturday = (6 - semesterStart.getDay() + 7) % 7;
      firstWeekEnd.setDate(firstWeekEnd.getDate() + daysToSaturday);
      firstWeekEnd.setHours(23, 59, 59, 999);

      console.log("📅 First week ends:", firstWeekEnd.toDateString());

      // Generate ICS content
      const icsLines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//UW Madison Schedule Downloader//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
      ];

      // Group class events by unique time slots and course (not by individual day)
      const groupedClasses = new Map<string, any[]>();
      const firstWeekEvents: any[] = [];
      
      for (const event of classEvents) {
        const firstOccurrence = findFirstOccurrence(event.dayOfWeek, semesterStart);
        
        // Set the actual class time for this occurrence
        const eventDateTime = new Date(firstOccurrence);
        eventDateTime.setHours(event.start.getHours(), event.start.getMinutes(), 0, 0);
        
        if (eventDateTime <= firstWeekEnd) {
          // This is a first week event - create individual occurrence
          firstWeekEvents.push({
            ...event,
            actualStart: eventDateTime,
            actualEnd: new Date(eventDateTime.getTime() + (event.end.getTime() - event.start.getTime()))
          });
        }
        
        // Group by course name and time (not including day) for recurring events
        const key = `${event.summary}-${event.start.getHours()}-${event.start.getMinutes()}`;
        if (!groupedClasses.has(key)) {
          groupedClasses.set(key, []);
        }
        groupedClasses.get(key)!.push(event);
      }

      console.log("📅 Creating", firstWeekEvents.length, "first week individual events");
      console.log("📅 Creating", groupedClasses.size, "recurring class series");

      // Add first week individual events
      for (const event of firstWeekEvents) {
        icsLines.push(
          'BEGIN:VEVENT',
          `UID:${uid()}`,
          `DTSTAMP:${formatDateTime(new Date())}`,
          `DTSTART;TZID=${userTimeZone}:${formatDateTime(event.actualStart)}`,
          `DTEND;TZID=${userTimeZone}:${formatDateTime(event.actualEnd)}`,
          `SUMMARY:${event.summary}`,
          `DESCRIPTION:${event.description}`,
          `LOCATION:${event.location}`,
          'END:VEVENT'
        );
      }

      // Add recurring class events starting from second week
      for (const [key, events] of groupedClasses) {
        const sampleEvent = events[0];
        
        // Collect all days this course meets (e.g., T,TH for Tuesday/Thursday)
        const allDays = [...new Set(events.map(e => getDayCode(e.dayOfWeek)))].sort();
        const daysList = allDays.join(',');
        
        // Find the earliest day in the second week for this course
        const secondWeekStart = new Date(firstWeekEnd);
        secondWeekStart.setDate(secondWeekStart.getDate() + 1); // Day after first week ends
        
        // Find the first occurrence of the earliest day of this course in the second week
        const earliestDayOfWeek = Math.min(...events.map(e => e.dayOfWeek));
        const secondWeekOccurrence = findFirstOccurrence(earliestDayOfWeek, secondWeekStart);
        
        // Set the time for this occurrence
        const startDateTime = new Date(secondWeekOccurrence);
        startDateTime.setHours(sampleEvent.start.getHours(), sampleEvent.start.getMinutes(), 0, 0);
        
        const endDateTime = new Date(secondWeekOccurrence);
        endDateTime.setHours(sampleEvent.end.getHours(), sampleEvent.end.getMinutes(), 0, 0);

        // Extend semester end to include December 10th
        const extendedSemesterEnd = new Date(semesterEnd);
        extendedSemesterEnd.setHours(23, 59, 59, 999);

        console.log(`📅 Creating recurring event for ${sampleEvent.summary} on ${daysList} starting ${startDateTime.toDateString()}`);

        icsLines.push(
          'BEGIN:VEVENT',
          `UID:${sampleEvent.uid}`,
          `DTSTAMP:${formatDateTime(new Date())}`,
          `DTSTART;TZID=${userTimeZone}:${formatDateTime(startDateTime)}`,
          `DTEND;TZID=${userTimeZone}:${formatDateTime(endDateTime)}`,
          `SUMMARY:${sampleEvent.summary}`,
          `DESCRIPTION:${sampleEvent.description}`,
          `LOCATION:${sampleEvent.location}`,
          `RRULE:FREQ=WEEKLY;BYDAY=${daysList};UNTIL=${formatDateTime(extendedSemesterEnd)}`
        );

        // Add break exceptions if we have any
        if (breakDates.size > 0) {
          const exceptionDateTimes: string[] = [];
          
          // For each day this course meets, check all occurrences against breaks
          for (const event of events) {
            const dayOfWeek = event.dayOfWeek;
            let currentDate = findFirstOccurrence(dayOfWeek, secondWeekStart);
            currentDate.setHours(sampleEvent.start.getHours(), sampleEvent.start.getMinutes(), 0, 0);
            
            while (currentDate <= extendedSemesterEnd) {
              const dateStr = formatDate(currentDate);
              if (breakDates.has(dateStr)) {
                // Format as datetime with timezone to match DTSTART format
                exceptionDateTimes.push(formatDateTime(currentDate));
                console.log(`🚫 Break exception for ${sampleEvent.summary} on ${currentDate.toDateString()}`);
              }
              currentDate.setDate(currentDate.getDate() + 7); // Next week
            }
          }
          
          // Remove duplicates and sort
          const uniqueExceptions = [...new Set(exceptionDateTimes)].sort();
          if (uniqueExceptions.length > 0) {
            icsLines.push(`EXDATE;TZID=${userTimeZone}:${uniqueExceptions.join(',')}`);
          }
        }

        icsLines.push('END:VEVENT');
      }

      console.log("📝 Creating", examEvents.length, "exam events");

      // Add exam events (no recurrence)
      for (const exam of examEvents) {
        icsLines.push(
          'BEGIN:VEVENT',
          `UID:${exam.uid}`,
          `DTSTAMP:${formatDateTime(new Date())}`,
          `DTSTART;TZID=${userTimeZone}:${formatDateTime(exam.start)}`,
          `DTEND;TZID=${userTimeZone}:${formatDateTime(exam.end)}`,
          `SUMMARY:${exam.summary}`,
          `DESCRIPTION:${exam.description}`,
          `LOCATION:${exam.location}`,
          'END:VEVENT'
        );
      }

      icsLines.push('END:VCALENDAR');

      const icsContent = icsLines.join('\r\n');
      console.log("💾 Generated ICS file:", icsContent.length, "characters");

      fileDownload(icsContent, "uw-schedule.ics");
      
      console.log("✅ Schedule downloaded successfully!");
      sendResponse({ success: true, message: "Schedule downloaded successfully" });

    } catch (error) {
      console.error("❌ Error:", error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true;
});
