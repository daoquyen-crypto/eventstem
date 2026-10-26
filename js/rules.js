/* Chọn bộ luật theo giải: event.ruleset = 'engage-2026' (mặc định) hoặc 'achieve-2026'.
   Giao diện chỉ gọi qua Rules.of(event) để không phải biết chi tiết từng luật. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engage.js'), require('./achieve.js'));
  else root.Rules = factory(root.Engage, root.Achieve);
})(typeof self !== 'undefined' ? self : this, function (E, A) {
  'use strict';
  var ENGAGE = {
    id: 'engage-2026', format: 'coop', manual: 'RECF Engage: Tier Takeover', grades: ['ES', 'MS'], minTeams: 2, slots: ['red', 'blue'],
    cfg: E.cfg, schedule: E.schedule, solo: E.soloRanking, redCards: E.redCards,
    ranking: E.allianceRanking, eligible: E.finalsEligible,
    performanceAwards: function (matches, runs) { return E.performanceAwards(matches, runs); },
    resultRows: E.resultRows
  };
  var ACHIEVE = {
    id: 'achieve-2026', format: 'versus', manual: 'RECF Achieve: Pinnacle', grades: ['MS', 'HS'], minTeams: 4, slots: A.SLOTS,
    cfg: A.cfg, schedule: A.schedule, solo: A.soloRanking, redCards: A.redCards,
    ranking: A.ranking, eligible: A.eligible, performanceAwards: A.performanceAwards, resultRows: A.resultRows
  };
  var BY = { 'engage-2026': ENGAGE, 'achieve-2026': ACHIEVE };
  /* Chương trình hiển thị trong form tạo giải: [program, ruleset] */
  var CHOICES = [
    { key: 'Engage', program: 'Engage', ruleset: 'engage-2026', en: 'RECF Engage (Tier Takeover)', vi: 'RECF Engage (Tier Takeover)' },
    { key: 'Achieve', program: 'Achieve', ruleset: 'achieve-2026', en: 'RECF Achieve (Pinnacle)', vi: 'RECF Achieve (Pinnacle)' },
    { key: 'Custom', program: 'Custom', ruleset: 'engage-2026', en: 'Independent tournament (Engage format: 2 teams cooperate)', vi: 'Giải tự tổ chức (thể thức Engage: 2 đội hợp tác)' },
    { key: 'Custom-versus', program: 'Custom', ruleset: 'achieve-2026', en: 'Independent tournament (Achieve format: 2 vs 2)', vi: 'Giải tự tổ chức (thể thức Achieve: 2 đấu 2)' }
  ];
  return {
    of: function (ev) { return BY[(ev && ev.ruleset) || 'engage-2026'] || ENGAGE; },
    byId: BY, CHOICES: CHOICES,
    choiceOf: function (ev) { var p = (ev && ev.program) || 'Engage', r = (ev && ev.ruleset) || 'engage-2026'; return CHOICES.find(function (c) { return c.program === p && c.ruleset === r; }) || CHOICES[0]; }
  };
});
