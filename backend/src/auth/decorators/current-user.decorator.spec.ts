import { CurrentUser } from './current-user.decorator';

describe('CurrentUser Decorator', () => {
  it('should be defined', () => {
    expect(CurrentUser).toBeDefined();
  });

  it('should be a function', () => {
    expect(typeof CurrentUser).toBe('function');
  });

  it('should create a parameter decorator', () => {
    // Test that the decorator can be called and returns a function
    const decorator = CurrentUser();
    expect(typeof decorator).toBe('function');
  });

  // Note: Testing parameter decorators in isolation is complex because they rely on
  // NestJS's internal metadata system. The actual functionality is better tested
  // through integration tests where the decorator is used in a real controller
  // with the NestJS framework handling the parameter injection.
});