jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  },
  getGenericPassword: jest.fn(async () => false),
  resetGenericPassword: jest.fn(async () => true),
  setGenericPassword: jest.fn(async () => true),
}));
