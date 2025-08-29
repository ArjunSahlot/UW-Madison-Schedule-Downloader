import fileDownload from "js-file-download";
import type { PlasmoCSConfig } from "plasmo";
import browser from "webextension-polyfill";

import { DOWNLOAD_SHED_MSG } from "~assets/constants";
import { processBreaks } from "~util/breakProcessor";
import { parseCourses } from "~util/courseParser";
import { ICSGenerator } from "~util/icsGenerator";
import type { DownloadScheduleMessage } from "~util/scheduleTypes";

export const config: PlasmoCSConfig = {
  matches: ["*://mumaaenroll.services.wisc.edu/courses-schedule*"]
};

browser.runtime.onMessage.addListener((message: DownloadScheduleMessage, sender, sendResponse) => {
  if (message.type !== DOWNLOAD_SHED_MSG) return true;

  console.log("📥 Starting schedule download process");

  (async () => {
    try {
      // Process breaks and get semester boundaries
      const { semesterStart, semesterEnd, breakDates } = processBreaks(message.payload);
      console.log("📅 Semester:", semesterStart.toDateString(), "to", semesterEnd.toDateString());

      // Parse all courses and events
      const { classEvents, examEvents } = parseCourses(semesterStart);
      console.log("📊 Total events:", classEvents.length, "classes,", examEvents.length, "exams");

      // Initialize ICS generator
      const icsGenerator = new ICSGenerator();

      // Find the end of the first week
      const firstWeekEnd = new Date(semesterStart);
      const daysToSaturday = (6 - semesterStart.getDay() + 7) % 7;
      firstWeekEnd.setDate(firstWeekEnd.getDate() + daysToSaturday);
      firstWeekEnd.setHours(23, 59, 59, 999);

      // Group classes and get first week events
      const groupedClasses = icsGenerator.groupClassesByTimeSlot(classEvents);
      const firstWeekEvents = icsGenerator.getFirstWeekEvents(classEvents, semesterStart, firstWeekEnd);

      console.log("📅 Creating", firstWeekEvents.length, "first week individual events");
      console.log("📅 Creating", groupedClasses.size, "recurring class series");

      // Generate ICS content
      const icsContent = icsGenerator.generateICS(
        firstWeekEvents,
        groupedClasses,
        examEvents,
        semesterStart,
        semesterEnd,
        breakDates
      );

      console.log("� Generated ICS file:", icsContent.length, "characters");

      // Download the file
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
