"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  applicationCreateSchema,
  APPLICATION_STATUS_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  type ApplicationCreateInput,
  type ApplicationCreateFormInput,
} from "@/lib/validation";
import { STATUS_LABELS } from "@/lib/utils";
import type { JobApplicationDTO } from "@/types/application";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application?: JobApplicationDTO | null;
  onSaved: () => void;
}

export function ApplicationFormDialog({ open, onOpenChange, application, onSaved }: Props) {
  const isEdit = Boolean(application);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ApplicationCreateFormInput, unknown, ApplicationCreateInput>({
    resolver: zodResolver(applicationCreateSchema),
    defaultValues: { status: "APPLIED" },
  });

  React.useEffect(() => {
    if (open) {
      reset(
        application
          ? {
              company: application.company,
              position: application.position,
              status: application.status as ApplicationCreateInput["status"],
              dateApplied: application.dateApplied ? new Date(application.dateApplied) : undefined,
              recruiterName: application.recruiterName,
              recruiterEmail: application.recruiterEmail,
              salaryMin: application.salaryMin,
              salaryMax: application.salaryMax,
              salaryCurrency: application.salaryCurrency,
              location: application.location,
              employmentType: application.employmentType as ApplicationCreateInput["employmentType"],
              source: application.source,
              notes: application.notes,
            }
          : { status: "APPLIED" }
      );
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale error text from a previous open
      setError(null);
    }
  }, [open, application, reset]);

  async function onSubmit(values: ApplicationCreateInput) {
    setSubmitting(true);
    setError(null);
    try {
      const url = isEdit ? `/api/applications/${application!.id}` : "/api/applications";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Failed to save application");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Application" : "Add Application"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the details for this application." : "Manually add a job application to track."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="company">Company *</Label>
              <Input id="company" {...register("company")} />
              {errors.company && <span className="text-xs text-red-500">{errors.company.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="position">Position *</Label>
              <Input id="position" {...register("position")} />
              {errors.position && <span className="text-xs text-red-500">{errors.position.message}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                {...register("status")}
                className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                {APPLICATION_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dateApplied">Date Applied</Label>
              <Input id="dateApplied" type="date" {...register("dateApplied")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recruiterName">Recruiter Name</Label>
              <Input id="recruiterName" {...register("recruiterName")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recruiterEmail">Recruiter Email</Label>
              <Input id="recruiterEmail" type="email" {...register("recruiterEmail")} />
              {errors.recruiterEmail && (
                <span className="text-xs text-red-500">{errors.recruiterEmail.message}</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="salaryMin">Salary Min</Label>
              <Input id="salaryMin" type="number" {...register("salaryMin")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="salaryMax">Salary Max</Label>
              <Input id="salaryMax" type="number" {...register("salaryMax")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="salaryCurrency">Currency</Label>
              <Input id="salaryCurrency" placeholder="USD" {...register("salaryCurrency")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location">Location</Label>
              <Input id="location" {...register("location")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="employmentType">Employment Type</Label>
              <select
                id="employmentType"
                {...register("employmentType")}
                className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <option value="">—</option>
                {EMPLOYMENT_TYPE_VALUES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source">Source</Label>
            <Input id="source" placeholder="LinkedIn, referral, company site…" {...register("source")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={3} {...register("notes")} />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
