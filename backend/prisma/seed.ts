import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Hash password for seed users
  const hashedPassword = await bcrypt.hash('password123', 12);

  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'System Administrator',
      password: hashedPassword,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      phone: '+1234567890',
      address: '123 Admin Street, Admin City, AC 12345',
    },
  });

  console.log('✅ Created admin user:', adminUser.email);

  // Create manager user
  const managerUser = await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      email: 'manager@example.com',
      name: 'Department Manager',
      password: hashedPassword,
      role: Role.MANAGER,
      status: UserStatus.ACTIVE,
      phone: '+1234567891',
      address: '456 Manager Avenue, Manager City, MC 23456',
    },
  });

  console.log('✅ Created manager user:', managerUser.email);

  // Create regular users
  const regularUsers: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const user = await prisma.user.upsert({
      where: { email: `user${i}@example.com` },
      update: {},
      create: {
        email: `user${i}@example.com`,
        name: `Regular User ${i}`,
        password: hashedPassword,
        role: Role.USER,
        status: i % 4 === 0 ? UserStatus.INACTIVE : UserStatus.ACTIVE,
        phone: i % 3 === 0 ? `+123456789${i}` : null,
        address:
          i % 2 === 0 ? `${i * 100} User Street, User City, UC ${i}0000` : null,
      },
    });
    regularUsers.push(user);
  }

  console.log(`✅ Created ${regularUsers.length} regular users`);

  // Create some audit logs
  const auditLogs: any[] = [];
  for (const user of [adminUser, managerUser, ...regularUsers.slice(0, 3)]) {
    const auditLog = await prisma.auditLog.create({
      data: {
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        newValues: {
          email: user.email,
          name: user.name,
          role: user.role,
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Seed Script',
      },
    });
    auditLogs.push(auditLog);
  }

  console.log(`✅ Created ${auditLogs.length} audit log entries`);

  // Create some user sessions
  const sessions: any[] = [];
  for (const user of [adminUser, managerUser, ...regularUsers.slice(0, 2)]) {
    const session = await prisma.userSession.create({
      data: {
        userId: user.id,
        token: `seed-token-${user.id}-${Date.now()}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        isActive: true,
      },
    });
    sessions.push(session);
  }

  console.log(`✅ Created ${sessions.length} user sessions`);

  // Create some password reset tokens (expired for testing cleanup)
  const passwordResets: any[] = [];
  for (const user of regularUsers.slice(0, 3)) {
    const passwordReset = await prisma.passwordReset.create({
      data: {
        email: user.email,
        token: `reset-token-${user.id}-${Date.now()}`,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago (expired)
        used: false,
      },
    });
    passwordResets.push(passwordReset);
  }

  console.log(`✅ Created ${passwordResets.length} password reset tokens`);

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📋 Seed Summary:');
  console.log(
    `   👤 Users: ${1 + 1 + regularUsers.length} (1 admin, 1 manager, ${regularUsers.length} regular)`,
  );
  console.log(`   📝 Audit Logs: ${auditLogs.length}`);
  console.log(`   🔑 Sessions: ${sessions.length}`);
  console.log(`   🔄 Password Resets: ${passwordResets.length}`);
  console.log('\n🔐 Default password for all users: password123');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
