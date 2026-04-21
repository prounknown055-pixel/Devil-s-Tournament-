// screens/HomeScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  RefreshControl, Image, Animated, Pressable, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useApp } from '../App';

const { width } = Dimensions.get('window');

const C = {
  bg: '#080810', surface: '#0e0e1c', card: '#111120',
  border: '#1e1e35', primary: '#ff5722', gold: '#FFD700',
  blue: '#2979ff', green: '#00e676', red: '#ff1744',
  white: '#ffffff', gray: '#7777aa', darkGray: '#2a2a45',
};

const GAME_TABS = [
  { key: 'all', label: '🎮 All', color: C.primary },
  { key: 'freefire', label: '🔥 Free Fire', color: '#ff5722' },
  { key: 'bgmi', label: '💙 BGMI', color: '#2979ff' },
];

export default function HomeScreen({ navigation }) {
  const { isAdmin } = useApp();
  const [tournaments, setTournaments] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [broadcast, setBroadcast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const adminPressCount = useRef(0);
  const adminPressTimer = useRef(null);
  const marqueeAnim = useRef(new Animated.Value(width)).current;

  useEffect(() => {
    fetchAll();
    const tSub = supabase
      .channel('home_tournaments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, fetchTournaments)
      .subscribe();
    const bSub = supabase
      .channel('home_broadcasts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcasts' }, fetchBroadcast)
      .subscribe();
    return () => {
      supabase.removeChannel(tSub);
      supabase.removeChannel(bSub);
    };
  }, []);

  useEffect(() => {
    filterTournaments();
  }, [tournaments, search, activeTab]);

  useEffect(() => {
    if (broadcast) startMarquee();
  }, [broadcast]);

  function startMarquee() {
    Animated.loop(
      Animated.timing(marqueeAnim, {
        toValue: -width * 2,
        duration: 12000,
        useNativeDriver: true,
      })
    ).start();
  }

  async function fetchAll() {
    setLoading(true);
    await Promise.all([fetchTournaments(), fetchBroadcast()]);
    setLoading(false);
  }

  async function fetchTournaments() {
    const { data } = await supabase
      .from('tournaments')
      .select('*')
      .in('status', ['upcoming', 'ongoing'])
      .order('tournament_date', { ascending: true });
    if (data) setTournaments(data);
  }

  async function fetchBroadcast() {
    const { data } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    setBroadcast(data || null);
  }

  function filterTournaments() {
    let list = [...tournaments];
    if (activeTab !== 'all') list = list.filter(t => t.game_type === activeTab);
    if (search.trim()) list = list.filter(t =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.organizer_name.toLowerCase().includes(search.toLowerCase())
    );
    setFiltered(list);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, []);

  function handleAdminTap() {
    adminPressCount.current += 1;
    if (adminPressTimer.current) clearTimeout(adminPressTimer.current);
    if (adminPressCount.current >= 5) {
      adminPressCount.current = 0;
      navigation.navigate('Admin');
    }
    adminPressTimer.current = setTimeout(() => { adminPressCount.current = 0; }, 2000);
  }

  function getGameColor(type) {
    return type === 'bgmi' ? C.blue : C.primary;
  }

  function getStatusColor(status) {
    if (status === 'ongoing') return C.green;
    if (status === 'upcoming') return C.gold;
    return C.gray;
  }

  function formatDate(date, time) {
    const d = new Date(`${date}T${time}`);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
      ' • ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  const renderTournament = ({ item }) => {
    const color = getGameColor(item.game_type);
    const slotsLeft = item.total_slots - item.filled_slots;
    const pct = item.filled_slots / item.total_slots;
    return (
      <TouchableOpacity
        style={[styles.card, { borderColor: color + '40' }]}
        onPress={() => navigation.navigate('TournamentDetail', { tournament: item })}
        activeOpacity={0.85}
      >
        {item.banner_url ? (
          <Image source={{ uri: item.banner_url }} style={styles.banner} />
        ) : (
          <LinearGradient
            colors={[color + '80', '#080810']}
            style={styles.bannerPlaceholder}
          >
            <MaterialCommunityIcons
              name={item.game_type === 'bgmi' ? 'pistol' : 'fire'}
              size={48} color={color} />
          </LinearGradient>
        )}
        <LinearGradient colors={['transparent', '#080810']} style={styles.bannerOverlay} />

        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '22',
          borderColor: getStatusColor(item.status) + '60' }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>

        {/* Game type badge */}
        <View style={[styles.gameBadge, { backgroundColor: color }]}>
          <Text style={styles.gameBadgeText}>
            {item.game_type === 'freefire' ? '🔥 FF' : '💙 BGMI'}
          </Text>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.tournamentName} numberOfLines={1}>{item.name}</Text>

          {/* PRIZE */}
          <Text style={styles.prizeLabel}>🏆 PRIZE POOL</Text>
          <Text style={styles.prizeValue}>{item.prize_pool}</Text>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="calendar-outline" size={13} color={C.gray} />
              <Text style={styles.infoText}>{formatDate(item.tournament_date, item.tournament_time)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="game-controller-outline" size={13} color={C.gray} />
              <Text style={styles.infoText}>{item.mode}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="person-outline" size={13} color={C.gray} />
              <Text style={styles.infoText}>{item.organizer_name}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="ticket-outline" size={13} color={C.gold} />
              <Text style={[styles.infoText, { color: C.gold }]}>
                {item.join_fee === 0 ? 'FREE' : `₹${item.join_fee}`}
              </Text>
            </View>
          </View>

          {/* Slot progress */}
          <View style={styles.slotRow}>
            <Text style={styles.slotText}>
              <Text style={{ color: color }}>{item.filled_slots}</Text>
              <Text style={{ color: C.gray }}>/{item.total_slots} Players</Text>
            </Text>
            <Text style={[styles.slotText, { color: slotsLeft > 0 ? C.green : C.red }]}>
              {slotsLeft > 0 ? `${slotsLeft} slots left` : 'FULL'}
            </Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${Math.min(pct * 100, 100)}%`,
              backgroundColor: pct > 0.8 ? C.red : pct > 0.5 ? C.gold : C.green }]} />
          </View>

          <TouchableOpacity
            style={[styles.joinBtn, { backgroundColor: color }]}
            onPress={() => navigation.navigate('TournamentDetail', { tournament: item })}
          >
            <Text style={styles.joinBtnText}>VIEW & JOIN →</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleAdminTap}>
          <LinearGradient colors={[C.primary, '#ff1744']} style={styles.logoGrad}>
            <Text style={styles.logoText}>⚡</Text>
          </LinearGradient>
        </Pressable>
        <View>
          <Text style={styles.appName}>BATTLE<Text style={{ color: C.primary }}>ZONE</Text></Text>
          <Text style={styles.appSub}>FF & BGMI Tournaments</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity style={styles.adminBtn} onPress={() => navigation.navigate('Admin')}>
            <Ionicons name="shield-checkmark" size={20} color={C.gold} />
          </TouchableOpacity>
        )}
      </View>

      {/* Broadcast Banner */}
      {broadcast && (
        <View style={styles.broadcastBanner}>
          <LinearGradient colors={['#ff572220', '#2979ff20']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.broadcastGrad}>
            <MaterialCommunityIcons name="bullhorn" size={16} color={C.gold} style={{ marginRight: 8 }} />
            <View style={{ flex: 1, overflow: 'hidden' }}>
              <Animated.Text style={[styles.broadcastText, { transform: [{ translateX: marqueeAnim }] }]}
                numberOfLines={1}>
                📢 {broadcast.message}{'          '}📢 {broadcast.message}
              </Animated.Text>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={C.gray} style={{ marginLeft: 12 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tournaments..."
          placeholderTextColor={C.gray}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={{ paddingRight: 12 }}>
            <Ionicons name="close-circle" size={18} color={C.gray} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {GAME_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && { backgroundColor: tab.color, borderColor: tab.color }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && { color: C.white }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <FlatList
        data={filtered}
        renderItem={renderTournament}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="tournament" size={64} color={C.darkGray} />
            <Text style={styles.emptyTitle}>No Tournaments Found</Text>
            <Text style={styles.emptySub}>Check back later for upcoming events</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, gap: 12 },
  logoGrad: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  logoText: { fontSize: 22 },
  appName: { fontSize: 22, fontWeight: '900', color: C.white, letterSpacing: 2 },
  appSub: { fontSize: 11, color: C.gray, letterSpacing: 1 },
  adminBtn: { marginLeft: 'auto', backgroundColor: C.gold + '22', padding: 8,
    borderRadius: 10, borderWidth: 1, borderColor: C.gold + '44' },
  broadcastBanner: { marginHorizontal: 16, marginBottom: 8, borderRadius: 10, overflow: 'hidden' },
  broadcastGrad: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    paddingHorizontal: 12, borderWidth: 1, borderColor: C.gold + '30', borderRadius: 10 },
  broadcastText: { color: C.gold, fontSize: 13, fontWeight: '600', width: 1000 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    marginHorizontal: 16, marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, color: C.white, fontSize: 15, paddingVertical: 12,
    paddingHorizontal: 10 },
  tabScroll: { marginBottom: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
    borderColor: C.border, backgroundColor: C.surface },
  tabText: { color: C.gray, fontSize: 13, fontWeight: '600' },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, marginBottom: 20,
    overflow: 'hidden', shadowColor: C.primary, shadowOpacity: 0.15,
    shadowRadius: 12, elevation: 5 },
  banner: { width: '100%', height: 160, resizeMode: 'cover' },
  bannerPlaceholder: { width: '100%', height: 160, justifyContent: 'center', alignItems: 'center' },
  bannerOverlay: { position: 'absolute', top: 100, left: 0, right: 0, height: 80 },
  statusBadge: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  gameBadge: { position: 'absolute', top: 12, left: 12, paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 8 },
  gameBadgeText: { color: C.white, fontSize: 11, fontWeight: '800' },
  cardBody: { padding: 16, paddingTop: 8 },
  tournamentName: { fontSize: 19, fontWeight: '900', color: C.white, marginBottom: 8, letterSpacing: 0.5 },
  prizeLabel: { fontSize: 11, color: C.gray, letterSpacing: 2, marginBottom: 2 },
  prizeValue: { fontSize: 26, fontWeight: '900', color: C.gold, marginBottom: 10,
    textShadowColor: C.gold, textShadowRadius: 8 },
  infoRow: { flexDirection: 'row', gap: 16, marginBottom: 6 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoText: { color: C.gray, fontSize: 12 },
  slotRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 5 },
  slotText: { fontSize: 12, fontWeight: '700' },
  progressBg: { height: 5, backgroundColor: C.darkGray, borderRadius: 3, marginBottom: 12 },
  progressFill: { height: 5, borderRadius: 3 },
  joinBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  joinBtnText: { color: C.white, fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.gray },
  emptySub: { fontSize: 13, color: C.darkGray },
});
