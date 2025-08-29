export interface Break {
  name: string;
  date: string;
  length: number;
}

export interface DownloadScheduleMessage {
  type: string;
  payload: Break[];
}

export interface ClassEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  dayOfWeek: number;
}

export interface ExamEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
}

export interface FirstWeekEvent extends ClassEvent {
  actualStart: Date;
  actualEnd: Date;
}
