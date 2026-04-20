/**
 * Empty-state aliases — maps each app surface to the best illustration
 * from the Envato pack. Import these when wiring illustrations into
 * EmptyState components.
 *
 * Usage:
 *   import { NoJobsIllustration } from "@/components/illustrations/aliases";
 *   <EmptyState illustration={<NoJobsIllustration className="h-40 w-auto" />} ... />
 */

// Job / workshop surfaces
export { CarRepairInProgressIllustration as NoJobsIllustration } from "./carRepairInProgressIllustration";
export { GarageOwnerWelcomingCustomersIllustration as KioskHeroIllustration } from "./garageOwnerWelcomingCustomersIllustration";
export { BatteryReplacementIllustration as NoCheckInsIllustration } from "./batteryReplacementIllustration";

// Customer / team
export { GarageOwnerWelcomingCustomersIllustration as NoCustomersIllustration } from "./garageOwnerWelcomingCustomersIllustration";

// Stock / parts
export { OrganizedFilingSystemIllustration as NoStockIllustration } from "./organizedFilingSystemIllustration";

// Warranties
export { DataSecurityIllustration as NoWarrantiesIllustration } from "./dataSecurityIllustration";

// Reports / dashboard
export { MissionAndVisionIllustration as NoReportsIllustration } from "./missionAndVisionIllustration";
export { RiskAnalysisIllustration as NoKpiDataIllustration } from "./riskAnalysisIllustration";

// Search
export { DocumentReviewIllustration as SearchEmptyIllustration } from "./documentReviewIllustration";

// Completion / success
export { MilestoneAchievementIllustration as AllCaughtUpIllustration } from "./milestoneAchievementIllustration";
export { MilestoneAchievementIllustration as SuccessIllustration } from "./milestoneAchievementIllustration";

// Audit
export { DocumentReviewIllustration as AuditLogEmptyIllustration } from "./documentReviewIllustration";

// System / error states
export { TechSupportFixingServerIssuesIllustration as ErrorIllustration } from "./techSupportFixingServerIssuesIllustration";
export { FixingDigitalDeviceConnectionsIllustration as OfflineIllustration } from "./fixingDigitalDeviceConnectionsIllustration";
export { UpdatingAndPatchingSoftwareIllustration as MaintenanceIllustration } from "./updatingAndPatchingSoftwareIllustration";
export { SoftwareDebuggingAndRepairIllustration as DebuggingIllustration } from "./softwareDebuggingAndRepairIllustration";
