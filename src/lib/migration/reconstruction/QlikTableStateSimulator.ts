import type { Operation } from "../enterprise-parser";

export interface SimulatedTableState {
  table: string;
  sequence: number;
  columns: string[];
  exists: boolean;
  dropped: boolean;
  createdBy?: string;
}

function clean(value: string): string {
  return String(value || "").trim().replace(/^['"\[`]+|['"\]`]+$/g, "");
}
function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map(clean).filter(Boolean)) {
    const key = value.toLowerCase();
    if (!seen.has(key)) { seen.add(key); result.push(value); }
  }
  return result;
}
function explicitFields(operation: Operation): string[] {
  return uniq([...(operation.inlineColumns || []), ...(operation.fields || [])].filter((field) => field !== "*"));
}

/**
 * Deterministic, script-order Qlik table-state simulator.
 * It intentionally uses array position as execution order; operation ids are diagnostics only.
 */
export class QlikTableStateSimulator {
  private before = new Map<number, Map<string, SimulatedTableState>>();
  private after = new Map<number, Map<string, SimulatedTableState>>();

  constructor(private readonly operations: Operation[]) { this.simulate(); }

  private clone(states: Map<string, SimulatedTableState>): Map<string, SimulatedTableState> {
    return new Map([...states.entries()].map(([key, value]) => [key, { ...value, columns: [...value.columns] }]));
  }
  private key(table: string): string { return clean(table).toLowerCase(); }
  private state(states: Map<string, SimulatedTableState>, table: string): SimulatedTableState | undefined {
    return states.get(this.key(table));
  }
  private normalizeRef(value: string): string {
    return String(value || "").replace(/\\/g, "/").replace(/\$\([^)]*\)/g, "").split("/").pop()?.toLowerCase() || "";
  }
  private sourceColumns(states: Map<string, SimulatedTableState>, operation: Operation, sequence: number): string[] {
    const resident = operation.resident?.[0];
    if (resident) return [...(this.state(states, resident)?.columns || [])];
    const sourceRef = operation.sourceRefs?.[0];
    if (sourceRef && /\.qvd(?:$|[\]\)])/i.test(sourceRef)) {
      const wanted = this.normalizeRef(sourceRef);
      for (let index = sequence - 1; index >= 0; index -= 1) {
        const candidate = this.operations[index];
        if (candidate.opType !== "store_qvd") continue;
        if ((candidate.qvdOutputs || []).some((output) => this.normalizeRef(output) === wanted)) {
          return [...(this.state(states, candidate.table)?.columns || [])];
        }
      }
    }
    return [];
  }
  private outputColumns(states: Map<string, SimulatedTableState>, operation: Operation, sequence: number): string[] {
    const explicit = explicitFields(operation);
    const hasStar = (operation.fields || []).includes("*") || /\bLOAD\s+\*/i.test(operation.raw || "");
    return uniq([...(hasStar ? this.sourceColumns(states, operation, sequence) : []), ...explicit]);
  }
  private simulate(): void {
    let states = new Map<string, SimulatedTableState>();
    this.operations.forEach((operation, sequence) => {
      this.before.set(sequence, this.clone(states));
      const target = operation.joinTarget || operation.concatTarget || operation.table;
      const targetKey = this.key(target);

      if (operation.opType === "drop") {
        const existing = states.get(targetKey);
        if (existing) states.set(targetKey, { ...existing, sequence, exists: false, dropped: true });
        this.after.set(sequence, this.clone(states));
        return;
      }

      if (operation.opType === "join_load" && operation.joinTarget) {
        const existing = this.state(states, operation.joinTarget);
        const sourceProjection = this.outputColumns(states, operation, sequence);
        const targetColumns = existing?.columns || [];
        const targetSet = new Set(targetColumns.map((column) => column.toLowerCase()));
        const payload = sourceProjection.filter((column) => !targetSet.has(column.toLowerCase()));
        states.set(targetKey, {
          table: operation.joinTarget, sequence, exists: true, dropped: false,
          createdBy: existing?.createdBy || operation.id,
          columns: uniq([...targetColumns, ...payload]),
        });
        this.after.set(sequence, this.clone(states));
        return;
      }

      if (operation.opType === "concat_load" && operation.concatTarget) {
        const existing = this.state(states, operation.concatTarget);
        states.set(targetKey, {
          table: operation.concatTarget, sequence, exists: true, dropped: false,
          createdBy: existing?.createdBy || operation.id,
          columns: uniq([...(existing?.columns || []), ...this.outputColumns(states, operation, sequence)]),
        });
        this.after.set(sequence, this.clone(states));
        return;
      }

      if (["load", "mapping_load"].includes(operation.opType)) {
        states.set(targetKey, {
          table: operation.table, sequence, exists: true, dropped: false,
          createdBy: operation.id,
          columns: this.outputColumns(states, operation, sequence),
        });
      }
      this.after.set(sequence, this.clone(states));
    });
  }

  getStateBefore(table: string, sequence: number): SimulatedTableState | undefined {
    return this.before.get(sequence)?.get(this.key(table));
  }
  getStateAfter(table: string, sequence: number): SimulatedTableState | undefined {
    return this.after.get(sequence)?.get(this.key(table));
  }
  getSourceProjection(operation: Operation, sequence: number): string[] {
    const states = this.before.get(sequence) || new Map<string, SimulatedTableState>();
    return this.outputColumns(states, operation, sequence);
  }
}
