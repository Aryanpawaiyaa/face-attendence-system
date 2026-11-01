const swaggerJsdoc = require('swagger-jsdoc');
const env = require('./env');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'FaceAttend Pro API',
      version: '2.0.0',
      description:
        'REST API powering a Face Recognition Attendance Management System, ' +
        'integrating with AMB82 Mini devices for automated attendance capture.',
    },
    servers: [
      {
        url: `http://localhost:${env.port}${env.apiPrefix}`,
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        deviceApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-device-api-key',
        },
      },
      // Reusable request-body schemas for create/update endpoints, so
      // route files can $ref a single definition instead of repeating
      // the same property list. Follows the same field names/constraints
      // as the corresponding express-validator rules.
      schemas: {
        ValidationError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation failed' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        DepartmentInput: {
          type: 'object',
          required: ['name', 'code'],
          properties: {
            name: { type: 'string' },
            code: { type: 'string', maxLength: 20 },
            description: { type: 'string' },
          },
        },
        CourseInput: {
          type: 'object',
          required: ['name', 'code', 'semester', 'departmentId'],
          properties: {
            name: { type: 'string' },
            code: { type: 'string' },
            semester: { type: 'integer', minimum: 1, maximum: 12 },
            departmentId: { type: 'string', format: 'uuid' },
            facultyId: { type: 'string', format: 'uuid', nullable: true },
          },
        },
        TeacherInput: {
          type: 'object',
          required: ['firstName', 'lastName', 'email', 'employeeId'],
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            employeeId: { type: 'string' },
            departmentId: { type: 'string', format: 'uuid' },
            designation: { type: 'string' },
          },
        },
        StudentInput: {
          type: 'object',
          required: ['rollNumber', 'firstName', 'lastName', 'departmentId', 'semester', 'year'],
          properties: {
            rollNumber: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            departmentId: { type: 'string', format: 'uuid' },
            branch: { type: 'string' },
            semester: { type: 'integer', minimum: 1, maximum: 12 },
            section: { type: 'string' },
            year: { type: 'integer', minimum: 1900 },
            faceId: { type: 'string' },
            photo: { type: 'string', format: 'binary', description: 'Optional face photo file' },
          },
        },
        DeviceRegisterInput: {
          type: 'object',
          required: ['deviceName', 'deviceCode'],
          properties: {
            deviceName: { type: 'string' },
            deviceCode: { type: 'string' },
            building: { type: 'string' },
            room: { type: 'string' },
          },
        },
        DeviceUpdateInput: {
          type: 'object',
          properties: {
            deviceName: { type: 'string' },
            building: { type: 'string' },
            room: { type: 'string' },
          },
        },
        NotificationInput: {
          type: 'object',
          required: ['type', 'title', 'message'],
          properties: {
            userId: {
              type: 'string',
              format: 'uuid',
              description: 'Target user id; omit to broadcast to all users',
            },
            type: { type: 'string', enum: ['ATTENDANCE_ALERT', 'DEVICE_OFFLINE', 'SYSTEM'] },
            channel: { type: 'string', enum: ['IN_APP', 'EMAIL', 'SMS'], default: 'IN_APP' },
            title: { type: 'string', maxLength: 150 },
            message: { type: 'string', maxLength: 1000 },
          },
        },
        AttendanceMarkInput: {
          type: 'object',
          required: ['studentId'],
          properties: {
            studentId: { type: 'string', format: 'uuid' },
            courseId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] },
            attendanceDate: { type: 'string', format: 'date' },
          },
        },
        ChangePasswordInput: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string', format: 'password' },
            newPassword: { type: 'string', format: 'password', minLength: 8 },
          },
        },
        ForgotPasswordInput: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
        ResetPasswordInput: {
          type: 'object',
          required: ['token', 'newPassword'],
          properties: {
            token: { type: 'string' },
            newPassword: { type: 'string', format: 'password', minLength: 8 },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  // Route + doc-comment files to scan for JSDoc @openapi blocks
  apis: ['./src/routes/*.js', './src/docs/*.js'],
};

module.exports = swaggerJsdoc(options);
