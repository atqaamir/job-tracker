export interface EmailSummary {
  gmailLink: string | null;
  category: string | null;
  receivedAt: string;
}

export interface JobApplicationDTO {
  id: string;
  company: string;
  position: string;
  status: string;
  dateApplied: string | null;
  dateLastEmail: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  location: string | null;
  employmentType: string | null;
  source: string | null;
  notes: string | null;
  isArchived: boolean;
  aiSummary: string | null;
  aiSentiment: string | null;
  aiNextAction: string | null;
  aiDeadline: string | null;
  createdAt: string;
  updatedAt: string;
  emails: EmailSummary[];
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
