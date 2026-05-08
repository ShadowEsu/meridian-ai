'use strict';

const WARN_FRACTION = 0.8;

function severity(actual, limit) {
  if (limit == null) return 'ok';
  if (actual >= limit) return 'over';
  if (actual >= limit * WARN_FRACTION) return 'warn';
  return 'ok';
}

function createBudgetEngine({ store }) {
  return {
    classify: async ({ userId, virtualKeyId, addUsd }) => {
      const vk = await store.virtualKeys.get(userId, virtualKeyId);
      if (!vk) return { severity: 'ok', scope: 'unknown' };

      const keyAfter = (vk.spentMtdUsd || 0) + addUsd;
      const keySev = severity(keyAfter, vk.monthlyBudgetUsd);

      let teamSev = 'ok';
      if (vk.teamId != null) {
        const team = await store.teams.get(userId, vk.teamId);
        if (team && team.monthlyBudgetUsd != null) {
          const teamKeys = (await store.virtualKeys.list(userId)).filter(k => k.teamId === vk.teamId);
          const teamSpent = teamKeys.reduce((s, k) => s + (k.spentMtdUsd || 0), 0) + addUsd;
          teamSev = severity(teamSpent, team.monthlyBudgetUsd);
        }
      }

      // Worst severity wins; team trumps key when equal.
      const order = { ok: 0, warn: 1, over: 2 };
      const winner = order[teamSev] >= order[keySev] ? 'team' : 'key';
      return { severity: order[teamSev] >= order[keySev] ? teamSev : keySev, scope: winner };
    },

    recordSpend: ({ virtualKeyId, addUsd }) => store.virtualKeys.recordSpend(virtualKeyId, addUsd),
  };
}

module.exports = { createBudgetEngine };
