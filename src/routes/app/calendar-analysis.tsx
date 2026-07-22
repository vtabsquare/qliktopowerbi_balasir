import { createFileRoute } from "@tanstack/react-router";
import { CalendarAnalysisPage } from "@/components/migration/CalendarAnalysisPage";
export const Route = createFileRoute("/app/calendar-analysis")({ component: CalendarAnalysisPage });
