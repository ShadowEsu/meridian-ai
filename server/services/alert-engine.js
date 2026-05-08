'use strict';

/**
 * createAlertEngine — evaluates active alerts on every request ingestion.
 *
 * Alert types handled:
 *   - key_budget:  triggers when the virtual key's MTD spend >= thresholdUsd
 *   - team_budget: triggers when the team's aggregate MTD spend >= thresholdUsd
 *   - spike:       triggers when RPM over windowMinutes >= thresholdRpm
 *   - agent_loop:  acknowledged in schema; engine ignores it (Task 12 wires it)
 *
 * Only alerts with state === 'active' are evaluated.
 *
 * @param {{ store: object }} opts
 * @returns {{ onRequest: function }}
 */
function createAlertEngine({ store }) {
  return {
    /**
     * @param {{ request: object, severity: object }} params
     */
    onRequest: async ({ request, severity }) => {
      const userId = request.userId;
      const alerts = await store.alerts.list(userId);
      for (const a of alerts) {
        if (a.state !== 'active') continue;

        let shouldTrigger = false;

        if (a.type === 'key_budget' && a.target?.virtualKeyId === request.virtualKeyId) {
          const vk = await store.virtualKeys.get(userId, request.virtualKeyId);
          if (vk && (vk.spentMtdUsd || 0) >= (a.thresholdUsd || Infinity)) shouldTrigger = true;
        } else if (a.type === 'team_budget' && a.target?.teamId && a.target.teamId === request.teamId) {
          const keys = await store.virtualKeys.list(userId);
          const teamSpend = keys
            .filter(k => k.teamId === a.target.teamId)
            .reduce((s, k) => s + (k.spentMtdUsd || 0), 0);
          if (teamSpend >= (a.thresholdUsd || Infinity)) shouldTrigger = true;
        } else if (a.type === 'spike') {
          const since = new Date(Date.now() - (a.windowMinutes || 5) * 60_000).toISOString();
          const count = await store.requests.countSince(userId, since);
          const rpm = count / (a.windowMinutes || 5);
          if (rpm >= (a.thresholdRpm || Infinity)) shouldTrigger = true;
        }
        // agent_loop is intentionally skipped here — Task 12 wires it from agent run updates.

        if (shouldTrigger) await store.alerts.setTriggered(a.id);
      }
    },
  };
}

module.exports = { createAlertEngine };
