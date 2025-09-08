import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import Redis from 'ioredis';

// Mock ioredis
jest.mock('ioredis');

describe('RedisService', () => {
  let service: RedisService;
  let mockRedisClient: jest.Mocked<Redis>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    // Create mock Redis client
    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue('OK'),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue('test-value'),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(3600),
      keys: jest.fn().mockResolvedValue(['key1', 'key2']),
      hset: jest.fn().mockResolvedValue(1),
      hget: jest.fn().mockResolvedValue('hash-value'),
      hgetall: jest
        .fn()
        .mockResolvedValue({ field1: 'value1', field2: 'value2' }),
      hdel: jest.fn().mockResolvedValue(1),
      on: jest.fn(),
    } as any;

    // Mock the Redis constructor
    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(
      () => mockRedisClient,
    );

    // Create mock ConfigService
    configService = {
      get: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should connect to Redis successfully', async () => {
      await service.onModuleInit();

      expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should use default Redis URL if not configured', async () => {
      configService.get.mockReturnValue(undefined);

      // Create a new service instance to test the default behavior
      const newService = new RedisService(configService);
      await newService.onModuleInit();

      expect(Redis).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.any(Object),
      );
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockRedisClient.connect.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('Connection failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from Redis', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should set key-value without TTL', async () => {
      await service.set('test-key', 'test-value');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test-key',
        'test-value',
      );
    });

    it('should set key-value with TTL', async () => {
      await service.set('test-key', 'test-value', 3600);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'test-key',
        3600,
        'test-value',
      );
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should get value by key', async () => {
      const result = await service.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
      expect(result).toBe('test-value');
    });

    it('should return null for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get('non-existent-key');

      expect(result).toBeNull();
    });
  });

  describe('del', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should delete key', async () => {
      const result = await service.del('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
      expect(result).toBe(1);
    });
  });

  describe('exists', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return true if key exists', async () => {
      const result = await service.exists('test-key');

      expect(mockRedisClient.exists).toHaveBeenCalledWith('test-key');
      expect(result).toBe(true);
    });

    it('should return false if key does not exist', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await service.exists('test-key');

      expect(result).toBe(false);
    });
  });

  describe('expire', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should set expiration for key', async () => {
      const result = await service.expire('test-key', 3600);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('test-key', 3600);
      expect(result).toBe(true);
    });
  });

  describe('ttl', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should get TTL for key', async () => {
      const result = await service.ttl('test-key');

      expect(mockRedisClient.ttl).toHaveBeenCalledWith('test-key');
      expect(result).toBe(3600);
    });
  });

  describe('deleteByPattern', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should delete keys by pattern', async () => {
      const result = await service.deleteByPattern('test:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith('key1', 'key2');
      expect(result).toBe(1);
    });

    it('should return 0 if no keys match pattern', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const result = await service.deleteByPattern('test:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedisClient.del).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });
  });

  describe('hash operations', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should set hash field', async () => {
      const result = await service.hset('hash-key', 'field', 'value');

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'hash-key',
        'field',
        'value',
      );
      expect(result).toBe(1);
    });

    it('should get hash field', async () => {
      const result = await service.hget('hash-key', 'field');

      expect(mockRedisClient.hget).toHaveBeenCalledWith('hash-key', 'field');
      expect(result).toBe('hash-value');
    });

    it('should get all hash fields', async () => {
      const result = await service.hgetall('hash-key');

      expect(mockRedisClient.hgetall).toHaveBeenCalledWith('hash-key');
      expect(result).toEqual({ field1: 'value1', field2: 'value2' });
    });

    it('should delete hash field', async () => {
      const result = await service.hdel('hash-key', 'field');

      expect(mockRedisClient.hdel).toHaveBeenCalledWith('hash-key', 'field');
      expect(result).toBe(1);
    });
  });

  describe('getClient', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return Redis client', () => {
      const client = service.getClient();

      expect(client).toBe(mockRedisClient);
    });
  });
});
