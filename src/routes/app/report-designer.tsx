import { createFileRoute } from "@tanstack/react-router";
import { ProfessionalReportDesignerPage } from "@/components/migration/ProfessionalReportDesignerPage";
export const Route = createFileRoute("/app/report-designer")({ component: ProfessionalReportDesignerPage });
