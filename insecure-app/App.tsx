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
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  createdAt: string;
};

type Profile = {
  id: string;
  email: string;
  displayName: string;
  profileNote: string;
  lowBalanceAlertRecipients?: string[];
};

type TabId = 'dashboard' | 'transactions' | 'transfer' | 'profile' | 'security';

const API_BASE = Platform.select({
  android: 'http://10.0.2.2:4002/api',
  default: 'http://localhost:4002/api',
});

const INSECURE_API_KEY = 'pk_live_1234567890abcdef';
const TOKEN_KEY = 'token';
const PROFILE_CACHE_KEY = 'profile_cache';
const TRANSACTIONS_CACHE_KEY = 'transactions_cache';

const initialForm = {
  email: 'alice@example.com',
  password: 'Str0ng!Pass',
  displayName: 'Alice Secure',
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [authForm, setAuthForm] = useState(initialForm);
  const [transferForm, setTransferForm] = useState({
    fromAccountId: 'acc_alice_checking',
    toAccountId: 'acc_alice_savings',
    amount: '-25',
    description: '<b>Pay rent</b>',
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState(
    `Insecure mode active. API key=${INSECURE_API_KEY}, plaintext storage enabled, demo only.`,
  );
  const [deepLink, setDeepLink] = useState('javascript:alert(1)');
  const [receiptLabel, setReceiptLabel] = useState('payload.js');

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (session) {
      void hydrateDashboard(session);
    }
  }, [session]);

  async function loadSession() {
    console.log('Loading insecure token from AsyncStorage');
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      setSession({
        accessToken: token,
        refreshToken: token,
        expiresIn: 315360000,
      });
    }
    setLoading(false);
  }

  async function persistSession(nextSession: Session | null) {
    if (!nextSession) {
      await AsyncStorage.multiRemove([TOKEN_KEY, PROFILE_CACHE_KEY, TRANSACTIONS_CACHE_KEY]);
      return;
    }
    await AsyncStorage.setItem(TOKEN_KEY, nextSession.accessToken);
  }

  async function hydrateDashboard(nextSession: Session) {
    setBusy(true);
    try {
      const [accountsData, transactionsData, profileData] = await Promise.all([
        insecureRequest<Account[]>('/accounts', { session: nextSession }),
        insecureRequest<Transaction[]>('/transactions', { session: nextSession }),
        insecureRequest<Profile>('/user/profile', { session: nextSession }),
      ]);
      console.log('Insecure dashboard payload', accountsData, transactionsData, profileData);
      setAccounts(accountsData);
      setTransactions(transactionsData);
      setProfile(profileData);
      await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileData));
      await AsyncStorage.setItem(TRANSACTIONS_CACHE_KEY, JSON.stringify(transactionsData));
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    setBusy(true);
    try {
      console.log('Login attempt', authForm.email, authForm.password);
      const nextSession = await insecureRequest<Session>('/auth/login', {
        method: 'POST',
        body: {
          email: authForm.email.trim(),
          password: authForm.password,
        },
      });
      await persistSession(nextSession);
      setSession(nextSession);
      setMessage('Logged in insecurely. Token stored in AsyncStorage and sent via query string.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    setBusy(true);
    try {
      await insecureRequest('/auth/register', {
        method: 'POST',
        body: {
          email: authForm.email.trim(),
          password: authForm.password,
          displayName: authForm.displayName,
        },
      });
      setMessage('Registration succeeded without strict validation.');
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
    await insecureRequest('/auth/logout', {
      method: 'POST',
      session,
      body: { refreshToken: session.refreshToken },
    });
    await persistSession(null);
    setSession(null);
    setAccounts([]);
    setTransactions([]);
    setProfile(null);
    setMessage('Local token removed, but backend never revoked the static token.');
  }

  async function submitTransfer() {
    if (!session) {
      return;
    }
    setBusy(true);
    try {
      await insecureRequest('/transactions/transfer', {
        method: 'POST',
        session,
        body: {
          fromAccountId: transferForm.fromAccountId,
          toAccountId: transferForm.toAccountId,
          amount: transferForm.amount,
          description: transferForm.description,
        },
      });
      await hydrateDashboard(session);
      setMessage('Transfer submitted without client validation and with raw HTML description.');
      setTab('transactions');
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
    await insecureRequest(`/transactions/${transactions[0].id}/receipt`, {
      method: 'POST',
      session,
      body: { receiptPath: receiptLabel },
    });
    await hydrateDashboard(session);
    setMessage('Arbitrary receipt payload accepted.');
  }

  async function saveProfile() {
    if (!session || !profile) {
      return;
    }
    const nextProfile = await insecureRequest<Profile>('/user/profile', {
      method: 'PUT',
      session,
      body: { displayName: profile.displayName },
    });
    setProfile(nextProfile);
    setMessage('Profile updated without sanitization.');
  }

  async function exportData() {
    if (!session) {
      return;
    }
    const payload = await insecureRequest('/user/data-export', {
      method: 'DELETE',
      session,
    });
    Alert.alert('Insecure export', JSON.stringify(payload, null, 2).slice(0, 600));
  }

  function acceptAnyDeepLink() {
    setMessage(`Deep link accepted without allowlist: ${deepLink}`);
  }

  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);

  if (!__DEV__) {
    return (
      <SafeAreaView style={styles.screen}>
        <CenteredState label="Insecure demo builds are blocked outside local development." />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <CenteredState label="Loading plaintext session..." />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.authContainer}>
          <Text style={styles.eyebrow}>OWASP Mobile Top 10 2024</Text>
          <Text style={styles.title}>Insecure Finance Manager</Text>
          <Text style={styles.subtitle}>
            Intentionally vulnerable demo app for local lab use only. It logs secrets and stores tokens in plaintext.
          </Text>

          <View style={styles.policyCard}>
            <Text style={styles.sectionTitle}>Silent collection notice</Text>
            <Text style={styles.bodyText}>
              This app proceeds without consent and assumes it may collect extra analytics and device identifiers.
            </Text>
          </View>

          <TextInput
            placeholder="Email"
            autoCapitalize="none"
            value={authForm.email}
            onChangeText={(value) => setAuthForm((current) => ({ ...current, email: value }))}
            style={styles.input}
            placeholderTextColor="#cf97a3"
          />
          <TextInput
            placeholder="Password"
            secureTextEntry
            value={authForm.password}
            onChangeText={(value) => setAuthForm((current) => ({ ...current, password: value }))}
            style={styles.input}
            placeholderTextColor="#cf97a3"
          />
          <TextInput
            placeholder="Display name"
            value={authForm.displayName}
            onChangeText={(value) => setAuthForm((current) => ({ ...current, displayName: value }))}
            style={styles.input}
            placeholderTextColor="#cf97a3"
          />

          <View style={styles.row}>
            <ActionButton label="Sign in" onPress={login} disabled={busy} />
            <ActionButton label="Register" onPress={register} disabled={busy} variant="secondary" />
          </View>

          <MessageBanner message={message} busy={busy} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.appContainer}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Demo-only insecure profile</Text>
          <Text style={styles.title}>Welcome back, {profile?.displayName ?? 'User'}</Text>
          <Text style={styles.subtitle}>
            Token in query string, raw server errors, and over-broad data visibility are all intentional here.
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
            <Text style={styles.sectionTitle}>Accounts from all users</Text>
            {accounts.map((account) => (
              <View key={account.id} style={styles.listItem}>
                <View style={styles.flex}>
                  <Text style={styles.listTitle}>{account.type.toUpperCase()}</Text>
                  <Text style={styles.bodyText}>Account ref: {account.accountNumberMasked}</Text>
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
            <Text style={styles.sectionTitle}>Leaky transaction history</Text>
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
              placeholder="payload.js"
              placeholderTextColor="#cf97a3"
            />
            <ActionButton label="Attach arbitrary receipt" onPress={attachReceipt} disabled={busy} />
          </View>
        )}

        {tab === 'transfer' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Unsafe transfer flow</Text>
            <TextInput
              style={styles.input}
              value={transferForm.fromAccountId}
              onChangeText={(value) => setTransferForm((current) => ({ ...current, fromAccountId: value }))}
              placeholder="From account"
              placeholderTextColor="#cf97a3"
            />
            <TextInput
              style={styles.input}
              value={transferForm.toAccountId}
              onChangeText={(value) => setTransferForm((current) => ({ ...current, toAccountId: value }))}
              placeholder="To account"
              placeholderTextColor="#cf97a3"
            />
            <TextInput
              style={styles.input}
              value={transferForm.amount}
              onChangeText={(value) => setTransferForm((current) => ({ ...current, amount: value }))}
              placeholder="Amount"
              placeholderTextColor="#cf97a3"
            />
            <TextInput
              style={styles.input}
              value={transferForm.description}
              onChangeText={(value) => setTransferForm((current) => ({ ...current, description: value }))}
              placeholder="Description"
              placeholderTextColor="#cf97a3"
            />
            <ActionButton label="Submit raw transfer" onPress={submitTransfer} disabled={busy} />
          </View>
        )}

        {tab === 'profile' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Profile and privacy gaps</Text>
            <TextInput
              style={styles.input}
              value={profile?.displayName ?? ''}
              onChangeText={(value) =>
                setProfile((current) => (current ? { ...current, displayName: value } : current))
              }
              placeholderTextColor="#cf97a3"
            />
            <Text style={styles.bodyText}>Email: {profile?.email}</Text>
            <Text style={styles.bodyText}>
              Shadow recipients: {profile?.lowBalanceAlertRecipients?.join(', ') ?? 'none'}
            </Text>
            <View style={styles.row}>
              <ActionButton label="Save profile" onPress={saveProfile} disabled={busy} />
              <ActionButton label="Export data" onPress={exportData} disabled={busy} variant="secondary" />
            </View>
          </View>
        )}

        {tab === 'security' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Intentional anti-patterns</Text>
            <Text style={styles.bodyText}>M1: Hardcoded API key and plaintext token storage.</Text>
            <Text style={styles.bodyText}>M3: Query-string tokens and no ownership checks.</Text>
            <Text style={styles.bodyText}>M4: Invalid input and raw HTML descriptions accepted.</Text>
            <Text style={styles.bodyText}>M6: Consent skipped and extra recipients exposed.</Text>
            <Text style={styles.bodyText}>M9: Sensitive payload cached in AsyncStorage.</Text>
            <TextInput
              style={styles.input}
              value={deepLink}
              onChangeText={setDeepLink}
              placeholderTextColor="#cf97a3"
            />
            <ActionButton label="Open any deep link" onPress={acceptAnyDeepLink} disabled={busy} />
            <ActionButton label="Logout" onPress={logout} disabled={busy} variant="secondary" />
          </View>
        )}

        <MessageBanner message={message} busy={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

async function insecureRequest<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    session?: Session;
  } = {},
) {
  const token = options.session?.accessToken;
  const url = new URL(`${API_BASE}${path}`);
  if (token) {
    url.searchParams.set('token', token);
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': INSECURE_API_KEY,
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
      <ActivityIndicator size="large" color="#ef7d5a" />
      <Text style={styles.bodyText}>{label}</Text>
    </View>
  );
}

function MessageBanner({ busy, message }: { busy: boolean; message: string }) {
  return (
    <View style={styles.banner}>
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
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      style={[
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
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
    backgroundColor: '#1f0f17',
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
    backgroundColor: '#341420',
    borderRadius: 24,
    padding: 20,
    gap: 12,
  },
  card: {
    backgroundColor: '#441a2a',
    borderRadius: 20,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#6a2b40',
  },
  policyCard: {
    backgroundColor: '#552233',
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  eyebrow: {
    color: '#ef7d5a',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    color: '#fff4eb',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#f0c8cf',
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    color: '#fff4eb',
    fontSize: 18,
    fontWeight: '700',
  },
  bodyText: {
    color: '#f0c8cf',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#5a2638',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#7d4052',
    color: '#fff4eb',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#ef7d5a',
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#7d4052',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#1f0f17',
    fontWeight: '800',
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
    backgroundColor: '#6a2b40',
  },
  tabButtonActive: {
    backgroundColor: '#ef7d5a',
  },
  tabText: {
    color: '#fff4eb',
    textTransform: 'capitalize',
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#1f0f17',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#6a2b40',
    gap: 12,
  },
  listTitle: {
    color: '#fff4eb',
    fontSize: 15,
    fontWeight: '700',
  },
  listAmount: {
    color: '#ef7d5a',
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
    backgroundColor: '#ef7d5a',
  },
  bannerText: {
    color: '#1f0f17',
    flex: 1,
    lineHeight: 19,
    fontWeight: '700',
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#552233',
    borderRadius: 18,
    padding: 14,
  },
  metricLabel: {
    color: '#f0c8cf',
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  metricValue: {
    color: '#fff4eb',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 6,
  },
});

export default App;
