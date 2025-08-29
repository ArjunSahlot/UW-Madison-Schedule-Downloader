import { DateTime } from "luxon";
import { uid } from "uid";

import getCleanedContent from "./getCleanedContent";
import { parseExamDetails, parseMeetingDetails } from "./parseDetails";
import type { ClassEvent, ExamEvent } from "./scheduleTypes";

export function parseCourses(semesterStart: Date): {
  classEvents: ClassEvent[];
  examEvents: ExamEvent[];
} {
  const courses = document.querySelectorAll("#course-meetings");
  const classEvents: ClassEvent[] = [];
  const examEvents: ExamEvent[] = [];

  for (let i = 0; i < courses.length; i++) {
    const courseElement = courses[i];
    const fullCourse = courseElement.querySelector("h3, strong")?.textContent || "";
    
    if (!fullCourse) continue;

    const [courseTitle] = fullCourse.split(": ");
    const lists = Array.from(courseElement.querySelectorAll(":scope > ul"));
    const [meetingList, examList] = lists;

    // Process exams
    if (examList) {
      const exams = examList.children;
      for (let j = 0; j < exams.length; j++) {
        const examStr = exams[j].querySelector("span")?.textContent || "";
        if (!examStr) continue;
        
        try {
          const examDetails = parseExamDetails(examStr);
          
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
                dayOfWeek: classStart.getDay()
              });
            }
          }
        } catch (error) {
          console.error("❌ Failed to parse meeting for", courseTitle, ":", error);
        }
      }
    }
  }

  return { classEvents, examEvents };
}
