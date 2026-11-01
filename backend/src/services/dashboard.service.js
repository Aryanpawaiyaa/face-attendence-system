const dashboardRepository = require('../repositories/dashboard.repository');
const { toDateOnly } = require('../repositories/attendance.repository');

/** Resolves an optional from/to query pair to a default "last 30 days" window. */
function resolveRange(from, to) {
  const resolvedTo = to ? toDateOnly(to) : toDateOnly(new Date());
  const resolvedFrom = from ? toDateOnly(from) : toDateOnly(new Date(resolvedTo.getTime() - 29 * 86400000));
  return { from: resolvedFrom, to: resolvedTo };
}

const dashboardService = {
  /** Top-level summary cards: entity totals + today's live breakdown. */
  async getSummary() {
    const [totals, today] = await Promise.all([
      dashboardRepository.getTotals(),
      dashboardRepository.getTodayBreakdown(),
    ]);
    return { totals, today };
  },

  async getDepartmentWiseAttendance({ from, to }) {
    const range = resolveRange(from, to);
    const departments = await dashboardRepository.getDepartmentWiseAttendance(range);
    return { range, departments };
  },

  async getTrend({ days = 7 }) {
    const clamped = Math.min(Math.max(Number(days) || 7, 1), 90);
    const trend = await dashboardRepository.getTrend({ days: clamped });
    return { days: clamped, trend };
  },

  async getTopAbsentees({ from, to, limit = 10 }) {
    const range = resolveRange(from, to);
    const clampedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const absentees = await dashboardRepository.getTopAbsentees({ ...range, limit: clampedLimit });
    return { range, absentees };
  },

  async getDeviceHealth({ staleMinutes = 30 } = {}) {
    const devices = await dashboardRepository.getDeviceHealth({ staleMinutes: Math.max(Number(staleMinutes) || 30, 1) });
    return {
      devices,
      offlineCount: devices.filter((d) => d.isStale).length,
    };
  },

  /**
   * Combined payload for the main dashboard page, so the frontend can
   * render everything from a single request instead of five round trips.
   */
  async getOverview({ trendDays = 7 } = {}) {
    const range = resolveRange();
    const [summary, departmentWise, trend, topAbsentees, deviceHealth] = await Promise.all([
      this.getSummary(),
      dashboardRepository.getDepartmentWiseAttendance(range),
      dashboardRepository.getTrend({ days: Math.min(Math.max(Number(trendDays) || 7, 1), 90) }),
      dashboardRepository.getTopAbsentees({ ...range, limit: 5 }),
      dashboardRepository.getDeviceHealth({}),
    ]);

    return {
      totals: summary.totals,
      today: summary.today,
      departmentWiseAttendance: departmentWise,
      trend,
      topAbsentees,
      deviceHealth: {
        devices: deviceHealth,
        offlineCount: deviceHealth.filter((d) => d.isStale).length,
      },
    };
  },
};

module.exports = dashboardService;
