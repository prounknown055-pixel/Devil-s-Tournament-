// screens/AdminScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Alert, Image, ActivityIndicator, FlatList, Switch, KeyboardAvoidingView,
  Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase, uploadImage, uuidv4 } from '../lib/supabase';
import { useApp } from '../App';

const C = {
  bg: '#080810', surface: '#0e0e1c', card: '#111120',
  border: '#1e1e35', primary: '#ff5722', gold: '#FFD700',
  blue: '#2979ff', green: '#00e676', red: '#ff1744',
  white: '#ffffff', gray: '#7777aa', darkGray: '#2a2a45',
};

const TABS = ['📢 Broadcast', '🏆 Tournaments', '✅ Pending', '💸 Withdrawals'];

export default function AdminScreen({ navigation }) {
  const { adminSession, isAdmin, setAdminSession, setIsAdmin } = useApp();
  const [tab, setTab] = useState(0);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) return Alert.alert('Missing', 'Enter email and password.');
    setLoginLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() });
    if (error) { Alert.alert('Login Failed', error.message); setLoginLoading(false); return; }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', data.user.id).single();
    if (!profile?.is_admin) {
      await supabase.auth.signOut();
      Alert.alert('Access Denied', 'You do not have admin privileges.\n\nSet is_admin=true in Supabase profiles table first.');
      setLoginLoading(false); return;
    }
    setAdminSession(data.session);
    setIsAdmin(true);
    setLoginLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setAdminSession(null); setIsAdmin(false);
    navigation.goBack();
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <LinearGradient colors={[C.primary + '30', '#080810']} style={styles.loginHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 16 }}>
            <Ionicons name="arrow-back" size={22} color={C.white} />
          </TouchableOpacity>
          <Ionicons name="shield-checkmark" size={56} color={C.gold} />
          <Text style={styles.loginTitle}>ADMIN PANEL</Text>
          <Text style={styles.loginSub}>BattleZone Tournament Management</Text>
        </LinearGradient>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.loginForm} keyboardShouldPersistTaps="handled">
            <Text style={styles.loginHint}>
              ⚠️ Admin access only. Set your account as admin in Supabase:{'\n'}
              UPDATE profiles SET is_admin = true WHERE email = 'your@email.com';
            </Text>
            <Text style={styles.label}>Admin Email</Text>
            <TextInput style={styles.input} placeholder="admin@email.com" placeholderTextColor={C.gray}
              value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} placeholder="Password" placeholderTextColor={C.gray}
              value={password} onChangeText={setPassword} secureTextEntry />
            <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loginLoading}>
              {loginLoading ? <ActivityIndicator color={C.white} /> :
                <Text style={styles.loginBtnText}>🔐 LOGIN AS ADMIN</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Admin Header */}
      <View style={styles.adminHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.adminTitle}>⚡ ADMIN PANEL</Text>
          <Text style={styles.adminEmail}>{adminSession?.user?.email}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={C.red} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {TABS.map((t, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.tabChip, tab === i && { backgroundColor: C.primary, borderColor: C.primary }]}
            onPress={() => setTab(i)}
          >
            <Text style={[styles.tabChipText, tab === i && { color: C.white }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === 0 && <BroadcastTab />}
      {tab === 1 && <TournamentsTab navigation={navigation} />}
      {tab === 2 && <PendingTab />}
      {tab === 3 && <WithdrawalsTab />}
    </SafeAreaView>
  );
}

// ─── BROADCAST TAB ───────────────────────────────────────────────
function BroadcastTab() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchBroadcasts(); }, []);

  async function fetchBroadcasts() {
    const { data } = await supabase.from('broadcasts').select('*').order('created_at', { ascending: false });
    if (data) setBroadcasts(data);
  }

  async function createBroadcast() {
    if (!message.trim()) return Alert.alert('Empty', 'Enter a message.');
    setLoading(true);
    // Deactivate all existing
    await supabase.from('broadcasts').update({ is_active: false }).eq('is_active', true);
    const { error } = await supabase.from('broadcasts').insert({
      message: message.trim(),
      is_active: true,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) Alert.alert('Error', error.message);
    else { setMessage(''); fetchBroadcasts(); }
    setLoading(false);
  }

  async function toggleBroadcast(id, current) {
    if (!current) {
      // Deactivate all others first
      await supabase.from('broadcasts').update({ is_active: false }).neq('id', id);
    }
    await supabase.from('broadcasts').update({ is_active: !current }).eq('id', id);
    fetchBroadcasts();
  }

  async function deleteBroadcast(id) {
    await supabase.from('broadcasts').delete().eq('id', id);
    fetchBroadcasts();
  }

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.adminCard}>
        <Text style={styles.adminCardTitle}>📢 New Broadcast Message</Text>
        <TextInput style={[styles.input, styles.textarea]} placeholder="Type your message for all players..."
          placeholderTextColor={C.gray} value={message} onChangeText={setMessage} multiline />
        <TouchableOpacity style={styles.primaryBtn} onPress={createBroadcast} disabled={loading}>
          {loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryBtnText}>BROADCAST NOW</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionHead}>All Messages</Text>
      {broadcasts.map(b => (
        <View key={b.id} style={[styles.broadcastItem, b.is_active && { borderColor: C.green + '60' }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.broadcastMsg}>{b.message}</Text>
            <Text style={styles.broadcastDate}>{new Date(b.created_at).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.broadcastActions}>
            <Switch value={b.is_active} onValueChange={() => toggleBroadcast(b.id, b.is_active)}
              trackColor={{ false: C.darkGray, true: C.green + '80' }} thumbColor={b.is_active ? C.green : C.gray} />
            <TouchableOpacity onPress={() => deleteBroadcast(b.id)} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={18} color={C.red} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── TOURNAMENTS TAB ─────────────────────────────────────────────
function TournamentsTab({ navigation }) {
  const [tournaments, setTournaments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);

  // Form state
  const [form, setForm] = useState({
    name: '', game_type: 'freefire', mode: 'Battle Royale', total_slots: '100',
    join_fee: '0', prize_pool: '', organizer_name: '', tournament_date: '',
    tournament_time: '', rules: '', upi_id: '', status: 'upcoming',
  });
  const [bannerUri, setBannerUri] = useState(null);
  const [qrUri, setQrUri] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchTournaments(); }, []);

  async function fetchTournaments() {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
    if (data) setTournaments(data);
  }

  async function pickImage(setter) {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!result.canceled) setter(result.assets[0].uri);
  }

  function resetForm() {
    setForm({ name: '', game_type: 'freefire', mode: 'Battle Royale', total_slots: '100',
      join_fee: '0', prize_pool: '', organizer_name: '', tournament_date: '',
      tournament_time: '', rules: '', upi_id: '', status: 'upcoming' });
    setBannerUri(null); setQrUri(null); setEditId(null);
  }

  async function saveTournament() {
    if (!form.name.trim()) return Alert.alert('Missing', 'Tournament name required.');
    if (!form.prize_pool.trim()) return Alert.alert('Missing', 'Prize pool required.');
    if (!form.organizer_name.trim()) return Alert.alert('Missing', 'Organizer name required.');
    if (!form.tournament_date.trim()) return Alert.alert('Missing', 'Date required (YYYY-MM-DD).');
    if (!form.tournament_time.trim()) return Alert.alert('Missing', 'Time required (HH:MM).');
    if (!form.rules.trim()) return Alert.alert('Missing', 'Tournament rules required.');

    setSaving(true);
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      let bannerUrl = null, qrUrl = null;

      if (bannerUri) {
        const p = `banners/${uuidv4()}.jpg`;
        bannerUrl = await uploadImage('tournament-banners', p, bannerUri);
      }
      if (qrUri) {
        const p = `qr/${uuidv4()}.jpg`;
        qrUrl = await uploadImage('payment-qr', p, qrUri);
      }

      const payload = {
        ...form,
        total_slots: parseInt(form.total_slots) || 100,
        join_fee: parseInt(form.join_fee) || 0,
        ...(bannerUrl && { banner_url: bannerUrl }),
        ...(qrUrl && { qr_image_url: qrUrl }),
        created_by: uid,
      };

      if (editId) {
        await supabase.from('tournaments').update(payload).eq('id', editId);
      } else {
        await supabase.from('tournaments').insert(payload);
      }

      Alert.alert('✅ Saved!', editId ? 'Tournament updated.' : 'Tournament created!');
      resetForm(); setShowForm(false); fetchTournaments();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTournament(id) {
    Alert.alert('Delete?', 'This will permanently delete the tournament and all participants.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('tournaments').delete().eq('id', id);
        fetchTournaments();
      }},
    ]);
  }

  async function updateStatus(id, status) {
    await supabase.from('tournaments').update({ status }).eq('id', id);
    fetchTournaments();
  }

  function startEdit(t) {
    setForm({
      name: t.name, game_type: t.game_type, mode: t.mode,
      total_slots: String(t.total_slots), join_fee: String(t.join_fee),
      prize_pool: t.prize_pool, organizer_name: t.organizer_name,
      tournament_date: t.tournament_date, tournament_time: t.tournament_time,
      rules: t.rules, upi_id: t.upi_id || '', status: t.status,
    });
    setEditId(t.id); setBannerUri(null); setQrUri(null); setShowForm(true);
  }

  const statusColors = { upcoming: C.gold, ongoing: C.green, completed: C.gray, cancelled: C.red };

  if (showForm) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <TouchableOpacity onPress={() => { resetForm(); setShowForm(false); }} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={22} color={C.white} />
            </TouchableOpacity>
            <Text style={styles.adminCardTitle}>{editId ? '✏️ Edit Tournament' : '🏆 Create Tournament'}</Text>
          </View>

          {/* Game Type */}
          <Text style={styles.label}>Game Type *</Text>
          <View style={styles.radioRow}>
            {['freefire', 'bgmi'].map(g => (
              <TouchableOpacity key={g}
                style={[styles.radioBtn, form.game_type === g && { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={() => setForm(f => ({ ...f, game_type: g }))}>
                <Text style={[styles.radioBtnText, form.game_type === g && { color: C.white }]}>
                  {g === 'freefire' ? '🔥 Free Fire' : '💙 BGMI'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tournament Name */}
          <Text style={styles.label}>Tournament Name *</Text>
          <TextInput style={styles.input} placeholder="e.g. Grand Finale Season 4"
            placeholderTextColor={C.gray} value={form.name}
            onChangeText={v => setForm(f => ({ ...f, name: v }))} />

          {/* Mode */}
          <Text style={styles.label}>Mode *</Text>
          <View style={styles.radioRow}>
            {['Battle Royale', 'Custom TDM', 'Clash Squad', 'Ranked'].map(m => (
              <TouchableOpacity key={m}
                style={[styles.radioBtn, form.mode === m && { backgroundColor: C.blue, borderColor: C.blue }]}
                onPress={() => setForm(f => ({ ...f, mode: m }))}>
                <Text style={[styles.radioBtnText, form.mode === m && { color: C.white }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Status */}
          <Text style={styles.label}>Status</Text>
          <View style={styles.radioRow}>
            {['upcoming', 'ongoing', 'completed', 'cancelled'].map(s => (
              <TouchableOpacity key={s}
                style={[styles.radioBtn, form.status === s && { backgroundColor: statusColors[s], borderColor: statusColors[s] }]}
                onPress={() => setForm(f => ({ ...f, status: s }))}>
                <Text style={[styles.radioBtnText, form.status === s && { color: C.bg }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Prize Pool */}
          <Text style={styles.label}>🏆 Prize Pool * (shown in big letters)</Text>
          <TextInput style={[styles.input, { fontSize: 18, fontWeight: '800', color: C.gold }]}
            placeholder="e.g. ₹10,000 Cash Prize!" placeholderTextColor={C.darkGray}
            value={form.prize_pool} onChangeText={v => setForm(f => ({ ...f, prize_pool: v }))} />

          {/* Organizer */}
          <Text style={styles.label}>Organizer Name *</Text>
          <TextInput style={styles.input} placeholder="Tournament organizer name"
            placeholderTextColor={C.gray} value={form.organizer_name}
            onChangeText={v => setForm(f => ({ ...f, organizer_name: v }))} />

          {/* Slots & Fee */}
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Total Slots *</Text>
              <TextInput style={styles.input} placeholder="100" placeholderTextColor={C.gray}
                value={form.total_slots} onChangeText={v => setForm(f => ({ ...f, total_slots: v }))}
                keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Join Fee (₹)</Text>
              <TextInput style={styles.input} placeholder="0" placeholderTextColor={C.gray}
                value={form.join_fee} onChangeText={v => setForm(f => ({ ...f, join_fee: v }))}
                keyboardType="numeric" />
            </View>
          </View>

          {/* Date & Time */}
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Date * (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} placeholder="2025-12-25" placeholderTextColor={C.gray}
                value={form.tournament_date} onChangeText={v => setForm(f => ({ ...f, tournament_date: v }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Time * (HH:MM)</Text>
              <TextInput style={styles.input} placeholder="18:00" placeholderTextColor={C.gray}
                value={form.tournament_time} onChangeText={v => setForm(f => ({ ...f, tournament_time: v }))} />
            </View>
          </View>

          {/* UPI */}
          <Text style={styles.label}>UPI ID</Text>
          <TextInput style={styles.input} placeholder="yourname@upi" placeholderTextColor={C.gray}
            value={form.upi_id} onChangeText={v => setForm(f => ({ ...f, upi_id: v }))} />

          {/* Banner Upload */}
          <Text style={styles.label}>Tournament Banner</Text>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage(setBannerUri)}>
            {bannerUri ? <Image source={{ uri: bannerUri }} style={styles.previewBanner} resizeMode="cover" />
              : <><Ionicons name="image-outline" size={28} color={C.gray} /><Text style={styles.uploadText}>Upload Banner Image</Text></>}
          </TouchableOpacity>

          {/* QR Upload */}
          <Text style={styles.label}>Payment QR Code</Text>
          <TouchableOpacity style={[styles.uploadBtn, { height: 150 }]} onPress={() => pickImage(setQrUri)}>
            {qrUri ? <Image source={{ uri: qrUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              : <><Ionicons name="qr-code-outline" size={28} color={C.gray} /><Text style={styles.uploadText}>Upload UPI QR Code</Text></>}
          </TouchableOpacity>

          {/* Rules */}
          <Text style={styles.label}>📜 Tournament Rules * (detailed, up to 5000 words)</Text>
          <TextInput
            style={[styles.input, styles.rulesInput]}
            placeholder="Write detailed tournament rules here...&#10;&#10;1. All players must join the room on time&#10;2. No hacking or modding&#10;3. ..."
            placeholderTextColor={C.gray}
            value={form.rules}
            onChangeText={v => setForm(f => ({ ...f, rules: v }))}
            multiline
            textAlignVertical="top"
          />
          <Text style={[styles.helperText, { textAlign: 'right', marginTop: -6 }]}>
            {form.rules.split(/\s+/).filter(Boolean).length} words
          </Text>

          {/* Save */}
          <TouchableOpacity style={styles.primaryBtn} onPress={saveTournament} disabled={saving}>
            {saving ? <ActivityIndicator color={C.white} /> :
              <Text style={styles.primaryBtnText}>{editId ? '💾 UPDATE TOURNAMENT' : '🚀 CREATE TOURNAMENT'}</Text>}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity style={[styles.primaryBtn, { marginBottom: 16 }]} onPress={() => setShowForm(true)}>
        <Ionicons name="add-circle" size={20} color={C.white} />
        <Text style={styles.primaryBtnText}>CREATE NEW TOURNAMENT</Text>
      </TouchableOpacity>

      {tournaments.length === 0 && <Text style={styles.emptyText}>No tournaments yet.</Text>}

      {tournaments.map(t => (
        <View key={t.id} style={styles.adminTCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.adminTName} numberOfLines={1}>{t.name}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <Text style={[styles.tBadge, { color: t.game_type === 'bgmi' ? C.blue : C.primary }]}>
                {t.game_type === 'bgmi' ? '💙 BGMI' : '🔥 FF'}
              </Text>
              <Text style={[styles.tBadge, { color: statusColors[t.status] }]}>{t.status.toUpperCase()}</Text>
              <Text style={[styles.tBadge, { color: C.gray }]}>{t.filled_slots}/{t.total_slots} players</Text>
            </View>
            <Text style={[styles.tBadge, { color: C.gold, marginTop: 2 }]}>{t.prize_pool}</Text>
          </View>
          <View style={styles.tActions}>
            <TouchableOpacity onPress={() => startEdit(t)} style={styles.tActionBtn}>
              <Ionicons name="pencil" size={16} color={C.blue} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              Alert.alert('Update Status', '', [
                { text: 'Upcoming', onPress: () => updateStatus(t.id, 'upcoming') },
                { text: 'Ongoing', onPress: () => updateStatus(t.id, 'ongoing') },
                { text: 'Completed', onPress: () => updateStatus(t.id, 'completed') },
                { text: 'Cancelled', onPress: () => updateStatus(t.id, 'cancelled') },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }} style={styles.tActionBtn}>
              <Ionicons name="flag" size={16} color={C.gold} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteTournament(t.id)} style={styles.tActionBtn}>
              <Ionicons name="trash" size={16} color={C.red} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── PENDING TAB ─────────────────────────────────────────────────
function PendingTab() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    fetchPending();
    const sub = supabase.channel('admin_pending')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, fetchPending)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [filter]);

  async function fetchPending() {
    setLoading(true);
    const q = supabase.from('participants').select('*, tournaments(name, join_fee, game_type)')
      .order('joined_at', { ascending: false });
    if (filter !== 'all') q.eq('status', filter);
    const { data } = await q;
    if (data) setPending(data);
    setLoading(false);
  }

  async function handleAction(id, action, note = '') {
    const updates = { status: action };
    if (note) updates.admin_note = note;
    await supabase.from('participants').update(updates).eq('id', id);
    fetchPending();
  }

  function confirmAction(item, action) {
    const isKick = action === 'kicked';
    const isReject = action === 'rejected';
    const title = action === 'approved' ? '✅ Approve?' : isKick ? '🚫 Kick Player?' : '❌ Reject?';
    const msg = isKick
      ? `Kick ${item.game_name}?\n\nNo refund. Player will be removed permanently.`
      : isReject
        ? `Reject join request from ${item.game_name}?`
        : `Approve slot for ${item.game_name}?\nUID: ${item.uid}`;

    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action === 'approved' ? 'Approve' : isKick ? 'Kick' : 'Reject',
        style: isKick || isReject ? 'destructive' : 'default',
        onPress: () => handleAction(item.id, action),
      },
    ]);
  }

  const statusColors = { pending: C.gold, approved: C.green, rejected: C.red, kicked: C.red };

  return (
    <View style={{ flex: 1 }}>
      {/* Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, maxHeight: 50 }}
        contentContainerStyle={{ gap: 8 }}>
        {['pending', 'approved', 'rejected', 'kicked', 'all'].map(f => (
          <TouchableOpacity key={f}
            style={[styles.filterChip, filter === f && { backgroundColor: C.primary, borderColor: C.primary }]}
            onPress={() => setFilter(f)}>
            <Text style={[styles.filterChipText, filter === f && { color: C.white }]}>{f.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={pending}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No entries found.</Text>}
          renderItem={({ item }) => (
            <View style={[styles.pendingCard, { borderColor: (statusColors[item.status] || C.border) + '40' }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={styles.pGameName}>{item.game_name}</Text>
                  {item.slot_number && (
                    <View style={styles.slotMini}><Text style={styles.slotMiniText}>#{item.slot_number}</Text></View>
                  )}
                </View>
                <Text style={styles.pInfo}>UID: {item.uid}</Text>
                <Text style={styles.pInfo}>UTR: {item.utr_number}</Text>
                <Text style={styles.pInfo}>Tournament: {item.tournaments?.name}</Text>
                <Text style={styles.pInfo}>Fee: ₹{item.tournaments?.join_fee}</Text>
                <Text style={styles.pInfo}>Joined: {new Date(item.joined_at).toLocaleString('en-IN')}</Text>
                <View style={[styles.statusPill, { backgroundColor: (statusColors[item.status] || C.gray) + '22',
                  borderColor: (statusColors[item.status] || C.gray) + '60' }]}>
                  <Text style={[styles.statusPillText, { color: statusColors[item.status] || C.gray }]}>
                    {item.status.toUpperCase()}
                  </Text>
                </View>
                {item.screenshot_url && (
                  <TouchableOpacity onPress={() => Alert.alert('Screenshot', item.screenshot_url)}>
                    <Text style={[styles.pInfo, { color: C.blue }]}>📸 View Name Screenshot</Text>
                  </TouchableOpacity>
                )}
                {item.admin_note && <Text style={[styles.pInfo, { color: C.red }]}>Note: {item.admin_note}</Text>}
              </View>

              {item.status === 'pending' && (
                <View style={styles.pendingBtns}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.green + '20',
                    borderColor: C.green + '60' }]}
                    onPress={() => confirmAction(item, 'approved')}>
                    <Ionicons name="checkmark" size={18} color={C.green} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.red + '20',
                    borderColor: C.red + '60' }]}
                    onPress={() => confirmAction(item, 'rejected')}>
                    <Ionicons name="close" size={18} color={C.red} />
                  </TouchableOpacity>
                </View>
              )}
              {item.status === 'approved' && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.red + '20',
                  borderColor: C.red + '60' }]}
                  onPress={() => confirmAction(item, 'kicked')}>
                  <Text style={{ color: C.red, fontSize: 11, fontWeight: '800' }}>KICK</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

// ─── WITHDRAWALS TAB ─────────────────────────────────────────────
function WithdrawalsTab() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithdrawals();
    const sub = supabase.channel('admin_withdrawals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, fetchWithdrawals)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  async function fetchWithdrawals() {
    const { data } = await supabase
      .from('withdrawals')
      .select('*, tournaments(name, prize_pool)')
      .order('created_at', { ascending: false });
    if (data) setWithdrawals(data);
    setLoading(false);
  }

  async function markPaid(id) {
    await supabase.from('withdrawals').update({ status: 'paid' }).eq('id', id);
    fetchWithdrawals();
    Alert.alert('✅ Marked as Paid', 'Withdrawal has been marked as paid.');
  }

  async function rejectWithdrawal(id) {
    Alert.alert('Reject?', 'Reject this withdrawal request?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        await supabase.from('withdrawals').update({ status: 'rejected' }).eq('id', id);
        fetchWithdrawals();
      }},
    ]);
  }

  const sColors = { pending: C.gold, paid: C.green, rejected: C.red };

  return loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> : (
    <FlatList
      data={withdrawals}
      keyExtractor={i => i.id}
      contentContainerStyle={{ padding: 16 }}
      ListEmptyComponent={<Text style={styles.emptyText}>No withdrawal requests.</Text>}
      renderItem={({ item }) => (
        <View style={[styles.withdrawCard, { borderColor: (sColors[item.status] || C.border) + '50' }]}>
          <Text style={styles.wTitle}>{item.game_name}</Text>
          <Text style={styles.wInfo}>UID: {item.uid}</Text>
          <Text style={styles.wInfo}>Tournament: {item.tournaments?.name}</Text>
          <Text style={[styles.wInfo, { color: C.gold }]}>Prize: {item.tournaments?.prize_pool}</Text>
          <Text style={styles.wInfo}>Attempts: {item.attempt_count}/5</Text>
          <Text style={styles.wInfo}>Submitted: {new Date(item.created_at).toLocaleString('en-IN')}</Text>

          <View style={[styles.statusPill, { backgroundColor: (sColors[item.status] || C.gray) + '22',
            borderColor: (sColors[item.status] || C.gray) + '60', marginVertical: 6 }]}>
            <Text style={[styles.statusPillText, { color: sColors[item.status] || C.gray }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>

          {item.winner_qr_url && (
            <View style={styles.winQrBox}>
              <Text style={styles.wInfo}>📱 Winner's QR (send prize here):</Text>
              <Image source={{ uri: item.winner_qr_url }} style={styles.winQrImg} resizeMode="contain" />
            </View>
          )}

          {item.status === 'pending' && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={[styles.wBtn, { backgroundColor: C.green + '20', borderColor: C.green + '60', flex: 1 }]}
                onPress={() => markPaid(item.id)}>
                <Text style={{ color: C.green, fontWeight: '800', fontSize: 13 }}>✅ MARK PAID</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.wBtn, { backgroundColor: C.red + '20', borderColor: C.red + '60' }]}
                onPress={() => rejectWithdrawal(item.id)}>
                <Ionicons name="close" size={18} color={C.red} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    />
  );
}

// ─── STYLES ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  loginHeader: { paddingTop: 20, paddingBottom: 32, paddingHorizontal: 20, alignItems: 'center' },
  loginTitle: { fontSize: 28, fontWeight: '900', color: C.white, letterSpacing: 4, marginTop: 12 },
  loginSub: { color: C.gray, fontSize: 13, marginTop: 4 },
  loginHint: { backgroundColor: C.primary + '15', borderRadius: 12, padding: 14, color: C.gray,
    fontSize: 12, lineHeight: 18, marginBottom: 20, borderWidth: 1, borderColor: C.primary + '30' },
  loginForm: { padding: 20 },
  loginBtn: { backgroundColor: C.primary, paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', marginTop: 8 },
  loginBtnText: { color: C.white, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  adminHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  adminTitle: { color: C.white, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  adminEmail: { color: C.gray, fontSize: 11, marginTop: 2 },
  logoutBtn: { padding: 8 },
  tabBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: C.border },
  tabChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
    borderColor: C.border, backgroundColor: C.surface, alignSelf: 'center' },
  tabChipText: { color: C.gray, fontSize: 12, fontWeight: '700' },
  tabContent: { flex: 1 },
  adminCard: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: C.border },
  adminCardTitle: { color: C.white, fontSize: 16, fontWeight: '800', marginBottom: 14 },
  sectionHead: { color: C.white, fontSize: 14, fontWeight: '800', marginBottom: 12, marginTop: 4 },
  broadcastItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  broadcastMsg: { color: C.white, fontSize: 14, flex: 1, marginBottom: 4 },
  broadcastDate: { color: C.gray, fontSize: 11 },
  broadcastActions: { alignItems: 'center', gap: 8 },
  label: { color: C.gray, fontSize: 13, marginBottom: 7, fontWeight: '600' },
  input: { backgroundColor: C.card, color: C.white, borderRadius: 12, padding: 14,
    fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  textarea: { height: 80, textAlignVertical: 'top' },
  rulesInput: { height: 240, textAlignVertical: 'top', fontSize: 14, lineHeight: 22 },
  helperText: { color: C.gray, fontSize: 11, marginBottom: 10 },
  radioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  radioBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  radioBtnText: { color: C.gray, fontSize: 13, fontWeight: '600' },
  row2: { flexDirection: 'row', gap: 12, marginBottom: 0 },
  uploadBtn: { backgroundColor: C.card, borderRadius: 12, borderWidth: 2, borderColor: C.border,
    borderStyle: 'dashed', height: 120, justifyContent: 'center', alignItems: 'center',
    marginBottom: 14, overflow: 'hidden' },
  previewBanner: { width: '100%', height: '100%', resizeMode: 'cover' },
  uploadText: { color: C.gray, fontSize: 13, marginTop: 8 },
  primaryBtn: { backgroundColor: C.primary, paddingVertical: 14, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { color: C.white, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  adminTCard: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  adminTName: { color: C.white, fontSize: 15, fontWeight: '800' },
  tBadge: { fontSize: 12, fontWeight: '700' },
  tActions: { flexDirection: 'row', gap: 6 },
  tActionBtn: { padding: 8, backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  filterChipText: { color: C.gray, fontSize: 12, fontWeight: '700' },
  pendingCard: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pGameName: { color: C.white, fontSize: 16, fontWeight: '800' },
  pInfo: { color: C.gray, fontSize: 12, marginBottom: 3 },
  slotMini: { backgroundColor: C.green + '22', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1, borderColor: C.green + '60' },
  slotMiniText: { color: C.green, fontSize: 12, fontWeight: '900' },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1, marginTop: 6 },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  pendingBtns: { flexDirection: 'column', gap: 8 },
  actionBtn: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center',
    alignItems: 'center', borderWidth: 1 },
  withdrawCard: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1 },
  wTitle: { color: C.white, fontSize: 17, fontWeight: '900', marginBottom: 4 },
  wInfo: { color: C.gray, fontSize: 13, marginBottom: 3 },
  winQrBox: { backgroundColor: C.card, borderRadius: 12, padding: 12, marginTop: 8,
    alignItems: 'center', borderWidth: 1, borderColor: C.border },
  winQrImg: { width: 160, height: 160, borderRadius: 10, marginTop: 8 },
  wBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: C.gray, textAlign: 'center', marginTop: 40, fontSize: 15 },
});
