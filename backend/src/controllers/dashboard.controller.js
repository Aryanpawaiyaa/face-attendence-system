const dashboardService = require('../services/dashboard.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

const dashboardController = {
  overview: asyncHandler(async (req, res) => {
    const { trendDays = 7 } = req.query;
    const result = await dashboardService.getOverview({ trendDays });
    return new ApiResponse(200, result, 'Dashboard overview retrieved').send(res);
  }),

  summary: asyncHandler(async (req, res) => {
    const result = await dashboardService.getSummary();
    return new ApiResponse(200, result, 'Dashboard summary retrieved').send(res);
  }),

  departmentWise: asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const result = await dashboardService.getDepartmentWiseAttendance({ from, to });
    return new ApiResponse(200, result, 'Department-wise attendance retrieved').send(res);
  }),

  trend: asyncHandler(async (req, res) => {
    const { days = 7 } = req.query;
    const result = await dashboardService.getTrend({ days });
    return new ApiResponse(200, result, 'Attendance trend retrieved').send(res);
  }),

  topAbsentees: asyncHandler(async (req, res) => {
    const { from, to, limit = 10 } = req.query;
    const result = await dashboardService.getTopAbsentees({ from, to, limit });
    return new ApiResponse(200, result, 'Top absentees retrieved').send(res);
  }),

  deviceHealth: asyncHandler(async (req, res) => {
    const { staleMinutes = 30 } = req.query;
    const result = await dashboardService.getDeviceHealth({ staleMinutes });
    return new ApiResponse(200, result, 'Device health retrieved').send(res);
  }),
};

module.exports = dashboardController;
