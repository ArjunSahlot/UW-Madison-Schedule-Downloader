import { DateTime, type WeekdayNumbers } from "luxon";

export interface Meeting {
  times: { start: DateTime; end: DateTime }[];
  location: string;
}

export interface Exam {
  start: DateTime;
  end: DateTime;
  location: string;
}

export const parseMeetingDetails = (
  scheduleStr: string,
  initDate: DateTime
): Meeting => {
  const [days, ...timeAndLocation] = scheduleStr.split(" ");

  const startTime = `${timeAndLocation[0]} ${timeAndLocation[1]}`;
  const endTime = `${timeAndLocation[3]} ${timeAndLocation[4]}`;
  const location = timeAndLocation.slice(5).join(" ");

  const startDate = initDate;
  const timeFormat = "h:mm a";

  const times = [...days].map((day) => {
    const dayOfWeek = dayToWeekday(day);
    const nextDay = startDate.set({ weekday: dayOfWeek });
    const startDateTime = DateTime.fromFormat(startTime, timeFormat).set({
      year: nextDay.year,
      month: nextDay.month,
      day: nextDay.day
    });
    const endDateTime = DateTime.fromFormat(endTime, timeFormat).set({
      year: nextDay.year,
      month: nextDay.month,
      day: nextDay.day
    });

    return { start: startDateTime, end: endDateTime };
  });

  return {
    times,
    location
  };
};

export const parseExamDetails = (examStr: string): Exam => {
  // Clean the string - remove extra whitespace and newlines
  const cleanStr = examStr.replace(/\s+/g, ' ').trim();
  
  // Example: "December 12, 10:05 AM - 12:05 PM - Location not specified"
  const parts = cleanStr.split(' - ');
  
  if (parts.length < 2) {
    throw new Error(`Invalid exam format: ${cleanStr}`);
  }
  
  const dateTimePart = parts[0]; // "December 12, 10:05 AM"
  const endTimePart = parts[1]; // "12:05 PM" 
  const locationPart = parts.length > 2 ? parts.slice(2).join(' - ') : "TBA";
  
  // Parse date and start time: "December 12, 10:05 AM"
  const dateTimeMatch = dateTimePart.match(/(\w+)\s+(\d+),\s+(\d+):(\d+)\s+(AM|PM)/);
  if (!dateTimeMatch) {
    throw new Error(`Could not parse date/time: ${dateTimePart}`);
  }
  
  const [, month, day, startHour, startMin, startAmPm] = dateTimeMatch;
  
  // Parse end time: "12:05 PM"
  const endTimeMatch = endTimePart.match(/(\d+):(\d+)\s+(AM|PM)/);
  if (!endTimeMatch) {
    throw new Error(`Could not parse end time: ${endTimePart}`);
  }
  
  const [, endHour, endMin, endAmPm] = endTimeMatch;
  
  // Convert to 24-hour format
  const startHour24 = convertTo24Hour(parseInt(startHour), startAmPm);
  const endHour24 = convertTo24Hour(parseInt(endHour), endAmPm);
  
  // Determine the correct year for exams
  // Exams are typically in December for Fall semester, May for Spring semester
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11
  
  let examYear = currentYear;
  const monthNum = getMonthNumber(month);
  
  // If we're in Fall semester (Aug-Dec), and exam is in December, use current year
  // If we're in Spring semester (Jan-May), and exam is in May, use current year
  // Otherwise, if current date is before the exam month, use current year
  // If current date is after the exam month, use next year
  if (currentMonth <= monthNum) {
    examYear = currentYear;
  } else {
    examYear = currentYear + 1;
  }
  
  // Create DateTime objects
  const startDateTime = DateTime.local(
    examYear,
    monthNum,
    parseInt(day),
    startHour24,
    parseInt(startMin)
  );
  
  const endDateTime = DateTime.local(
    examYear,
    monthNum,
    parseInt(day),
    endHour24,
    parseInt(endMin)
  );
  
  if (!startDateTime.isValid) {
    throw new Error(`Invalid start date: ${startDateTime.invalidReason}`);
  }
  
  if (!endDateTime.isValid) {
    throw new Error(`Invalid end date: ${endDateTime.invalidReason}`);
  }

  return {
    start: startDateTime,
    end: endDateTime,
    location: locationPart.trim()
  };
};

const convertTo24Hour = (hour: number, ampm: string): number => {
  if (ampm.toUpperCase() === 'AM') {
    return hour === 12 ? 0 : hour;
  } else {
    return hour === 12 ? 12 : hour + 12;
  }
};

const getMonthNumber = (monthName: string): number => {
  const months = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12
  };
  return months[monthName.toLowerCase()] || 12; // Default to December
};

const dayToWeekday = (day: string): WeekdayNumbers => {
  switch (day) {
    case "M":
      return 1;
    case "T":
      return 2;
    case "W":
      return 3;
    case "R":
      return 4;
    case "F":
      return 5;
    default:
      throw new Error("Invalid day abbreviation");
  }
};
