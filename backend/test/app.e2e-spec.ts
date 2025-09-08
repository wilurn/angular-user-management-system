import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  describe('Health Endpoints', () => {
    it('/health (GET)', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBeDefined();
          expect(res.body.database).toBeDefined();
          expect(res.body.timestamp).toBeDefined();
          expect(res.body.uptime).toBeDefined();
          expect(res.body.connection).toBeDefined();
        });
    });

    it('/health/database (GET)', () => {
      return request(app.getHttpServer())
        .get('/health/database')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.database).toBe('connected');
          expect(res.body.responseTime).toBeGreaterThan(0);
          expect(res.body.timestamp).toBeDefined();
        });
    });

    it('/health/database/detailed (GET)', () => {
      return request(app.getHttpServer())
        .get('/health/database/detailed')
        .expect(200)
        .expect((res) => {
          expect(res.body.isHealthy).toBe(true);
          expect(res.body.connectionStatus).toBe('connected');
          expect(res.body.responseTime).toBeGreaterThan(0);
          expect(res.body.connection).toBeDefined();
          expect(res.body.timestamp).toBeDefined();
        });
    });

    it('/health/database/operations (GET)', () => {
      return request(app.getHttpServer())
        .get('/health/database/operations')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.message).toBe('All database operations working correctly');
          expect(res.body.operations).toBeDefined();
          expect(res.body.operations.canRead).toBe(true);
          expect(res.body.operations.canWrite).toBe(true);
          expect(res.body.operations.canDelete).toBe(true);
          expect(res.body.operations.errors).toHaveLength(0);
          expect(res.body.timestamp).toBeDefined();
        });
    });
  });
});
