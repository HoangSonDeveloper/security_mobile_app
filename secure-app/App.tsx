import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Keychain from 'react-native-keychain';

type Session = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type Account = {
  id: string;
  type: string;
  balance: number;
  currency: string;
  accountNumberMasked: string;
};

type Transaction = {
  id: string;
  amount: number;
  description: string;
  category: string;
  status: string;
  receiptPath?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  createdAt: string;
};

type Profile = {
  id: string;
  email: string;
  displayName: string;
  profileNote: string;
};

type TabId = 'dashboard' | 'transactions' | 'transfer' | 'profile' | 'security';

const API_BASE = Platform.select({
  android: 'http://10.0.2.2:4001/api',
  default: 'http://localhost:4001/api',
});

const SESSION_SERVICE = 'owasp-demo-secure-session';

const initialForm = {
  email: 'alice@example.com',
  password: 'Str0ng!Pass',
  displayName: 'Alice Secure',
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [authForm, setAuthForm] = useState(initialForm);
  const [transferForm, setTransferForm] = useState({
    fromAccountId: 'acc_alice_checking',
    toAccountId: 'acc_alice_savings',
    amount: '125.50',
    description: 'Monthly savings top-up',
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState('Secure mode uses header auth, validation, and masked data.');
  const [deepLink, setDeepLink] = useState('finance://app/transfer?to=acc_alice_savings');
  const [receiptLabel, setReceiptLabel] = useState('receipt-april.png');

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (session) {
      void hydrateDashboard(session);
    }
  }, [session]);

  async function loadSession() {
    try {
      const stored = await Keychain.getGenericPassword({ service: SESSION_SERVICE });
      if (stored) {
        setSession(JSON.parse(stored.password) as Session);
      }
    } catch (error) {
      console.warn('Failed to load secure session', error);
    } finally {
      setLoading(false);
    }
  }

  async function persistSession(nextSession: Session | null) {
    if (!nextSession) {
      await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
      return;
    }

    await Keychain.setGenericPassword('session', JSON.stringify(nextSession), {
      service: SESSION_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async function hydrateDashboard(nextSession: Session) {
    setBusy(true);
    try {
      const [accountsData, transactionsData, profileData] = await Promise.all([
        secureRequest<Account[]>('/accounts', { session: nextSession }),
        secureRequest<Transaction[]>('/transactions', { session: nextSession }),
        secureRequest<Profile>('/user/profile', { session: nextSession }),
      ]);
      setAccounts(accountsData);
      setTransactions(transactionsData);
      setProfile(profileData);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    if (!acceptedPrivacy) {
      setMessage('Accept the privacy notice before collecting or transmitting any data.');
      return;
    }
    setBusy(true);
    try {
      const nextSession = await secureRequest<Session>('/auth/login', {
        method: 'POST',
        body: {
          email: authForm.email.trim(),
          password: authForm.password,
        },
      });
      await persistSession(nextSession);
      setSession(nextSession);
      setMessage('Logged in securely with RS256 access token + refresh rotation support.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    setBusy(true);
    try {
      await secureRequest('/auth/register', {
        method: 'POST',
        body: {
          email: authForm.email.trim(),
          password: authForm.password,
          displayName: authForm.displayName.trim(),
        },
      });
      setMessage('Registration succeeded. Sign in to continue.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (!session) {
      return;
    }
    setBusy(true);
    try {
      await secureRequest('/auth/logout', {
        method: 'POST',
        session,
        body: { refreshToken: session.refreshToken },
      });
      await persistSession(null);
      setSession(null);
      setAccounts([]);
      setTransactions([]);
      setProfile(null);
      setMessage('Session revoked and removed from secure storage.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitTransfer() {
    if (!session) {
      return;
    }
    setBusy(true);
    try {
      await secureRequest('/transactions/transfer', {
        method: 'POST',
        session,
        body: {
          fromAccountId: transferForm.fromAccountId,
          toAccountId: transferForm.toAccountId,
          amount: Number(transferForm.amount),
          description: transferForm.description.trim(),
        },
      });
      await hydrateDashboard(session);
      setTab('transactions');
      setMessage('Transfer submitted through validated secure endpoint.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function attachReceipt() {
    if (!session || transactions.length === 0) {
      return;
    }
    setBusy(true);
    try {
      await secureRequest(`/transactions/${transactions[0].id}/receipt`, {
        method: 'POST',
        session,
        body: { receiptPath: receiptLabel },
      });
      await hydrateDashboard(session);
      setMessage('Receipt metadata accepted only for allowlisted image file names.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!session || !profile) {
      return;
    }
    setBusy(true);
    try {
      const nextProfile = await secureRequest<Profile>('/user/profile', {
        method: 'PUT',
        session,
        body: {
          displayName: profile.displayName,
        },
      });
      setProfile(nextProfile);
      setMessage('Profile updated with sanitized display name.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    if (!session) {
      return;
    }
    const payload = await secureRequest('/user/data-export', {
      method: 'DELETE',
      session,
    });
    Alert.alert('Data export', JSON.stringify(payload, null, 2).slice(0, 600));
  }

  async function deleteAccount() {
    if (!session) {
      return;
    }
    await secureRequest('/user/account', {
      method: 'DELETE',
      session,
    });
    await persistSession(null);
    setSession(null);
    setMessage('Account deleted and refresh tokens revoked.');
  }

  function validateDeepLink() {
    try {
      const url = new URL(deepLink);
      const allowed = url.protocol === 'finance:' && url.hostname === 'app';
      setMessage(
        allowed
          ? 'Deep link passed allowlist validation.'
          : 'Deep link rejected because only finance://app/* is allowed.',
      );
    } catch (_error) {
      setMessage('Deep link rejected because it is not a valid URL.');
    }
  }

  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <CenteredState label="Loading secure vault..." />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.authContainer}>
          <Text style={styles.eyebrow}>OWASP Mobile Top 10 2024</Text>
          <Text style={styles.title}>Secure Finance Manager</Text>
          <Text style={styles.subtitle}>
            Demonstrates secure credential handling, validated input, masked data, and privacy-first flows.
          </Text>

          <View style={styles.policyCard}>
            <Text style={styles.sectionTitle}>Privacy Notice</Text>
            <Text style={styles.bodyText}>
              This secure app asks for consent before collecting profile, transfer, and receipt metadata.
            </Text>
            <Pressable
              onPress={() => setAcceptedPrivacy((value) => !value)}
              style={[styles.toggle, acceptedPrivacy && styles.toggleActive]}>
              <Text style={styles.toggleText}>
                {acceptedPrivacy ? 'Consent captured' : 'Tap to consent'}
              </Text>
            </Pressable>
          </View>

          <TextInput
            placeholder="Email"
            autoCapitalize="none"
            value={authForm.email}
            onChangeText={(value) => setAuthForm((current) => ({ ...current, email: value }))}
            style={styles.input}
          />
          <TextInput
            placeholder="Password"
            secureTextEntry
            value={authForm.password}
            onChangeText={(value) => setAuthForm((current) => ({ ...current, password: value }))}
            style={styles.input}
          />
          <TextInput
            placeholder="Display name"
            value={authForm.displayName}
            onChangeText={(value) => setAuthForm((current) => ({ ...current, displayName: value }))}
            style={styles.input}
          />

          <View style={styles.row}>
            <ActionButton label="Sign in" onPress={login} disabled={busy} />
            <ActionButton label="Register" onPress={register} disabled={busy} variant="secondary" />
          </View>

          <MessageBanner message={message} busy={busy} tone="secure" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.appContainer}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Secure profile</Text>
          <Text style={styles.title}>Welcome back, {profile?.displayName ?? 'User'}</Text>
          <Text style={styles.subtitle}>
            Token stored in Keychain, authorization enforced on backend, and account numbers masked in UI.
          </Text>
          <View style={styles.row}>
            <MetricCard label="Total balance" value={`$${totalBalance.toFixed(2)}`} />
            <MetricCard label="Transactions" value={String(transactions.length)} />
          </View>
        </View>

        <View style={styles.tabRow}>
          {(['dashboard', 'transactions', 'transfer', 'profile', 'security'] as TabId[]).map((item) => (
            <Pressable
              key={item}
              style={[styles.tabButton, tab === item && styles.tabButtonActive]}
              onPress={() => setTab(item)}>
              <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'dashboard' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Accounts</Text>
            {accounts.map((account) => (
              <View key={account.id} style={styles.listItem}>
                <View>
                  <Text style={styles.listTitle}>{account.type.toUpperCase()}</Text>
                  <Text style={styles.bodyText}>{account.accountNumberMasked}</Text>
                </View>
                <Text style={styles.listAmount}>
                  {account.currency} {account.balance.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'transactions' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent transactions</Text>
            {transactions.map((transaction) => (
              <View key={transaction.id} style={styles.listItem}>
                <View style={styles.flex}>
                  <Text style={styles.listTitle}>{transaction.description}</Text>
                  <Text style={styles.bodyText}>
                    {transaction.category} • {new Date(transaction.createdAt).toLocaleString()}
                  </Text>
                  <Text style={styles.bodyText}>
                    Receipt: {transaction.receiptPath ? transaction.receiptPath : 'Not attached'}
                  </Text>
                </View>
                <Text style={styles.listAmount}>${transaction.amount.toFixed(2)}</Text>
              </View>
            ))}

            <TextInput
              style={styles.input}
              value={receiptLabel}
              onChangeText={setReceiptLabel}
              placeholder="receipt-april.png"
            />
            <ActionButton label="Attach receipt metadata" onPress={attachReceipt} disabled={busy} />
          </View>
        )}

        {tab === 'transfer' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Transfer money</Text>
            <TextInput
              style={styles.input}
              value={transferForm.fromAccountId}
              onChangeText={(value) => setTransferForm((current) => ({ ...current, fromAccountId: value }))}
              placeholder="From account"
            />
            <TextInput
              style={styles.input}
              value={transferForm.toAccountId}
              onChangeText={(value) => setTransferForm((current) => ({ ...current, toAccountId: value }))}
              placeholder="To account"
            />
            <TextInput
              style={styles.input}
              value={transferForm.amount}
              onChangeText={(value) => setTransferForm((current) => ({ ...current, amount: value }))}
              keyboardType="decimal-pad"
              placeholder="Amount"
            />
            <TextInput
              style={styles.input}
              value={transferForm.description}
              onChangeText={(value) => setTransferForm((current) => ({ ...current, description: value }))}
              placeholder="Description"
            />
            <ActionButton label="Submit validated transfer" onPress={submitTransfer} disabled={busy} />
          </View>
        )}

        {tab === 'profile' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Profile and privacy controls</Text>
            <TextInput
              style={styles.input}
              value={profile?.displayName ?? ''}
              onChangeText={(value) =>
                setProfile((current) => (current ? { ...current, displayName: value } : current))
              }
            />
            <Text style={styles.bodyText}>Email: {profile?.email}</Text>
            <Text style={styles.bodyText}>Profile note: {profile?.profileNote}</Text>
            <View style={styles.row}>
              <ActionButton label="Save profile" onPress={saveProfile} disabled={busy} />
              <ActionButton label="Export data" onPress={exportData} disabled={busy} variant="secondary" />
            </View>
            <ActionButton label="Delete account" onPress={deleteAccount} disabled={busy} variant="danger" />
          </View>
        )}

        {tab === 'security' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Security controls</Text>
            <Text style={styles.bodyText}>M1: Secrets are stored in native secure storage.</Text>
            <Text style={styles.bodyText}>M4: Client-side validation stops malformed transfer requests.</Text>
            <Text style={styles.bodyText}>M5: Only secure header-based auth is used.</Text>
            <Text style={styles.bodyText}>M6: Consent is explicit and data export/delete is available.</Text>
            <Text style={styles.bodyText}>M9: Sensitive UI values stay masked.</Text>
            <TextInput style={styles.input} value={deepLink} onChangeText={setDeepLink} />
            <ActionButton label="Validate deep link" onPress={validateDeepLink} disabled={busy} />
            <ActionButton label="Logout" onPress={logout} disabled={busy} variant="secondary" />
          </View>
        )}

        <MessageBanner message={message} busy={busy} tone="secure" />
      </ScrollView>
    </SafeAreaView>
  );
}

async function secureRequest<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    session?: Session;
  } = {},
) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.session ? { Authorization: `Bearer ${options.session.accessToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return null as T;
  }

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

function CenteredState({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#0a5a54" />
      <Text style={styles.bodyText}>{label}</Text>
    </View>
  );
}

function MessageBanner({
  busy,
  message,
  tone,
}: {
  busy: boolean;
  message: string;
  tone: 'secure' | 'insecure';
}) {
  return (
    <View style={[styles.banner, tone === 'secure' ? styles.bannerSecure : styles.bannerInsecure]}>
      {busy ? <ActivityIndicator color="#fff" /> : null}
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

function ActionButton({
  disabled,
  label,
  onPress,
  variant = 'primary',
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <Pressable
      style={[
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        disabled && styles.buttonDisabled,
      ]}
      disabled={disabled}
      onPress={onPress}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2efe5',
  },
  authContainer: {
    padding: 24,
    gap: 14,
  },
  appContainer: {
    padding: 20,
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
  },
  card: {
    backgroundColor: '#fffef9',
    borderRadius: 20,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#d7d0c1',
  },
  policyCard: {
    backgroundColor: '#dceee8',
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  eyebrow: {
    color: '#0a5a54',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    color: '#17302d',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#4d5d5b',
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    color: '#17302d',
    fontSize: 18,
    fontWeight: '700',
  },
  bodyText: {
    color: '#4d5d5b',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#cfc6b5',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#0a5a54',
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#8c9f9b',
  },
  buttonDanger: {
    backgroundColor: '#8a2f2f',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#d7d0c1',
  },
  tabButtonActive: {
    backgroundColor: '#17302d',
  },
  tabText: {
    color: '#17302d',
    textTransform: 'capitalize',
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ece6d8',
    gap: 12,
  },
  listTitle: {
    color: '#17302d',
    fontSize: 15,
    fontWeight: '700',
  },
  listAmount: {
    color: '#0a5a54',
    fontWeight: '800',
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  banner: {
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  bannerSecure: {
    backgroundColor: '#17302d',
  },
  bannerInsecure: {
    backgroundColor: '#7d2f3f',
  },
  bannerText: {
    color: '#ffffff',
    flex: 1,
    lineHeight: 19,
  },
  toggle: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    backgroundColor: '#8c9f9b',
  },
  toggleActive: {
    backgroundColor: '#0a5a54',
  },
  toggleText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#dceee8',
    borderRadius: 18,
    padding: 14,
  },
  metricLabel: {
    color: '#4d5d5b',
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  metricValue: {
    color: '#17302d',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 6,
  },
});

export default App;
