/* Chọn bộ luật theo giải: event.ruleset = 'engage-2026' (mặc định), 'achieve-2026' hoặc 'adc-2027'.
   Giao diện chỉ gọi qua Rules.of(event) để không phải biết chi tiết từng luật. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engage.js'), require('./achieve.js'), require('./adc.js'));
  else root.Rules = factory(root.Engage, root.Achieve, root.ADC);
})(typeof self !== 'undefined' ? self : this, function (E, A, D) {
  'use strict';
  var ENGAGE = {
    id: 'engage-2026', format: 'coop', manual: 'RECF Engage: Tier Takeover', grades: ['ES', 'MS'], minTeams: 2, slots: ['red', 'blue'],
    cfg: E.cfg, schedule: E.schedule, solo: E.soloRanking, redCards: E.redCards,
    ranking: E.allianceRanking, eligible: E.finalsEligible,
    performanceAwards: function (matches, runs) { return E.performanceAwards(matches, runs); },
    resultRows: E.resultRows, solo2: ['Driving', 'Coding']
  };
  var ACHIEVE = {
    id: 'achieve-2026', format: 'versus', manual: 'RECF Achieve: Pinnacle', grades: ['MS', 'HS'], minTeams: 4, slots: A.SLOTS,
    cfg: A.cfg, schedule: A.schedule, solo: A.soloRanking, redCards: A.redCards,
    ranking: A.ranking, eligible: A.eligible, performanceAwards: A.performanceAwards, resultRows: A.resultRows, solo2: ['Driving', 'Coding']
  };
  /* ADC: trận Alliance hợp tác như Engage, nhưng sau vòng loại là chọn liên minh + loại trực tiếp theo vòng (eliminations: 'rounds').
     Solo tính lượt riêng cho từng loại (soloPerKind): 3 Piloting + 3 Autonomous. */
  var ADC = {
    id: 'adc-2027', format: 'coop', eliminations: 'rounds', manual: 'RECF ADC Mission 2027: Fast Track', grades: ['ES', 'MS', 'HS'], minTeams: 2, slots: ['red', 'blue'],
    cfg: D.cfg, schedule: D.schedule, solo: D.soloRanking, redCards: D.redCards,
    ranking: D.ranking, eligible: D.eligible, performanceAwards: D.performanceAwards, resultRows: D.resultRows,
    solo2: ['Piloting', 'Autonomous'], soloPerKind: true
  };
  var BY = { 'engage-2026': ENGAGE, 'achieve-2026': ACHIEVE, 'adc-2027': ADC };
  /* Chương trình hiển thị trong form tạo giải: [program, ruleset] */
  var CHOICES = [
    { key: 'Engage', program: 'Engage', ruleset: 'engage-2026', en: 'RECF Engage (Tier Takeover)', vi: 'RECF Engage (Tier Takeover)' },
    { key: 'Achieve', program: 'Achieve', ruleset: 'achieve-2026', en: 'RECF Achieve (Pinnacle)', vi: 'RECF Achieve (Pinnacle)' },
    { key: 'ADC', program: 'ADC', ruleset: 'adc-2027', en: 'RECF Aerial Drone Competition (Fast Track)', vi: 'RECF Aerial Drone Competition (Fast Track)' },
    { key: 'Custom', program: 'Custom', ruleset: 'engage-2026', en: 'Independent tournament (Engage format: 2 teams cooperate)', vi: 'Giải tự tổ chức (thể thức Engage: 2 đội hợp tác)' },
    { key: 'Custom-versus', program: 'Custom', ruleset: 'achieve-2026', en: 'Independent tournament (Achieve format: 2 vs 2)', vi: 'Giải tự tổ chức (thể thức Achieve: 2 đấu 2)' }
  ];
  return {
    of: function (ev) { return BY[(ev && ev.ruleset) || 'engage-2026'] || ENGAGE; },
    byId: BY, CHOICES: CHOICES,
    choiceOf: function (ev) { var p = (ev && ev.program) || 'Engage', r = (ev && ev.ruleset) || 'engage-2026'; return CHOICES.find(function (c) { return c.program === p && c.ruleset === r; }) || CHOICES[0]; }
  };
});
