import { describe, it, expect } from "vitest";
import { isDemoUser, isPathLockedInDemo, isTourAllowedInDemo, DEMO_ACCOUNT_EMAIL } from "../src/lib/demo-mode";
import type { User } from "@supabase/supabase-js";

describe("Demo Version Mode", () => {
  describe("isDemoUser identification", () => {
    it("identifies the designated demo email correctly", () => {
      const user = { email: "vtabpublicuser@gmail.com" } as User;
      expect(isDemoUser(user)).toBe(true);
    });

    it("identifies uppercase/whitespace variants of the demo email", () => {
      const user = { email: "  VTABPUBLICUSER@GMAIL.COM  " } as User;
      expect(isDemoUser(user)).toBe(true);
    });

    it("identifies user with is_demo flag in user_metadata", () => {
      const user = { email: "custom@client.com", user_metadata: { is_demo: true } } as unknown as User;
      expect(isDemoUser(user)).toBe(true);
    });

    it("does not flag regular authorized or admin accounts as demo", () => {
      const adminUser = { email: "admin@vtab.com" } as User;
      const clientUser = { email: "client.engineer@enterprise.com" } as User;
      expect(isDemoUser(adminUser)).toBe(false);
      expect(isDemoUser(clientUser)).toBe(false);
    });

    it("handles null or undefined safely", () => {
      expect(isDemoUser(null)).toBe(false);
      expect(isDemoUser(undefined)).toBe(false);
    });
  });

  describe("isPathLockedInDemo route restrictions", () => {
    it("locks Logs, Calendars, and Report Designer in Demo Version while allowing Power BI Model, Relationships, and Validation & Export", () => {
      expect(isPathLockedInDemo("/app/powerbi-model")).toBe(false);
      expect(isPathLockedInDemo("/app/relationships")).toBe(false);
      expect(isPathLockedInDemo("/app/semantic-model")).toBe(false);
      expect(isPathLockedInDemo("/app/logs")).toBe(true);
      expect(isPathLockedInDemo("/app/calendar-analysis")).toBe(true);
      expect(isPathLockedInDemo("/app/report-designer")).toBe(true);
    });

    it("opens Phase 1 and Phase 2 stages in Demo Version", () => {
      expect(isPathLockedInDemo("/app/instructions")).toBe(false);
      expect(isPathLockedInDemo("/app")).toBe(false);
      expect(isPathLockedInDemo("/app/")).toBe(false);
      expect(isPathLockedInDemo("/app/qvw-analysis")).toBe(false);
      expect(isPathLockedInDemo("/app/expression-conversion")).toBe(false);
      expect(isPathLockedInDemo("/app/analysis")).toBe(false);
      expect(isPathLockedInDemo("/app/power-query")).toBe(false);
      expect(isPathLockedInDemo("/app/dax-measures")).toBe(false);
    });

    it("allows public authentication and root routes", () => {
      expect(isPathLockedInDemo("/")).toBe(false);
      expect(isPathLockedInDemo("/auth")).toBe(false);
      expect(isPathLockedInDemo("/privacy")).toBe(false);
    });
  });

  describe("isTourAllowedInDemo version restrictions", () => {
    it("allows interactive tour exclusively in Demo Version", () => {
      expect(isTourAllowedInDemo(true)).toBe(true);
    });

    it("strictly disallows interactive tour in normal, production, or enterprise versions", () => {
      expect(isTourAllowedInDemo(false)).toBe(false);
      expect(isTourAllowedInDemo(undefined as unknown as boolean)).toBe(false);
      expect(isTourAllowedInDemo(null as unknown as boolean)).toBe(false);
    });

    it("ensures normal authenticated users are never granted tour access", () => {
      const regularUser = { email: "engineer@company.com" } as User;
      const isDemo = isDemoUser(regularUser);
      expect(isTourAllowedInDemo(isDemo)).toBe(false);
    });

    it("ensures demo authenticated users are granted tour access", () => {
      const demoUser = { email: DEMO_ACCOUNT_EMAIL } as User;
      const isDemo = isDemoUser(demoUser);
      expect(isTourAllowedInDemo(isDemo)).toBe(true);
    });
  });
});
