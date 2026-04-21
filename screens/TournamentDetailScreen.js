// screens/TournamentDetailScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  Dimensions, Alert, Linking, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useApp } from '../App';

const { width } = Dimensions.get('window');
const C = {
  bg: '#080810', surface: '#0e0e1c', card: '#111120',
  border: '#1e1e35', primary: '#ff5722', gold: '#FFD700',
  blue: '#2979ff', green: '#00e676', red: '#ff1744',
  white: '#ffffff', gray: '#7777aa', darkGray: '#2a2a45',
};

export default function TournamentDetailScreen({ route, navigation }) {
  const { tournament: initial } = route.params;
  const { deviceId, isAdmin } = useApp();
  const [tournament, setTournament] = useState(initial);
  const [participants, setParticipants] = useState([]);
  const [myEntry, setMyEntry] = useState(null);
  const [activeTab, setActiveTab] = useState('info');
  const [loading, setLoading] = useState(false);

  const color = tournament.game_type === 'bgmi' ? C.blue : C.primary;

  useEffect(() => {
    fetchParticipants();
    fetchTournament();
    const sub = supabase
      .channel(`detail_${tournament.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'participants',
        filter: `tournament_id=eq.${tournament.id}`
      }, () => fetchParticipants())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tournaments',
        filter: `id=eq.${tournament.id}`
      }, () => fetchTournament())
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  async function fetchTournament() {
    const { data } = await supabase.from('tournaments').select('*').eq('id', tournament.id).single();
    if (data) setTournament(data);
  }

  async function fetchParticipants() {
    const { data } = await supabase
      .from('participants')
      .select('*')
      .eq('tournament_id', tournament.id)
      .order('slot_number', { ascending: true });
    if (data) {
      setParticipants(data);
      const me = data.find(p => p.device_id === deviceId);
      setMyEntry(me || null);
    }
  }

  function formatDate(date, time) {
    const d = new Date(`${date}T${time}`);
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      + '\n' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function getMyStatusInfo() {
    if (!myEntry) return null;
    const map = {
      pending: { text: '⏳ Payment Pending Verification', color: C.gold },
      approved: { text: `✅ APPROVED — Slot #${myEntry.slot_number}`, color: C.green },
      rejected: { text: '❌ Entry Rejected by Admin', color: C.red },
      kicked: { text: '🚫 Kicked from Tournament', color: C.red },
    };
    return map[myEntry.status];
  }

  const statusInfo = getMyStatusInfo();
  const slotsLeft = tournament.total_slots - tournament.filled_slots;
  const approvedList = participants.filter(p => p.status === 'approved');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        {/* Banner */}
        <View style={styles.bannerContainer}>
          {tournament.banner_url ? (
            <Image source={{ uri: tournament.banner_url }} style={styles.banner} />
          ) : (
            <LinearGradient colors={[color + '90', '#080810']} style={styles.banner}>
              <MaterialCommunityIcons
                name={tournament.game_type === 'bgmi' ? 'pistol' : 'fire'}
                size={80} color={color} />
            </LinearGradient>
          )}
          <LinearGradient colors={['transparent', '#080810']} style={styles.bannerFade} />
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={C.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Game Badge + Status */}
          <View style={styles.badgeRow}>
            <View style={[styles.gameBadge, { backgroundColor: color }]}>
              <Text style={styles.gameBadgeText}>
                {tournament.game_type === 'freefire' ? '🔥 FREE FIRE' : '💙 BGMI'}
              </Text>
            </View>
            <View style={[styles.modeBadge, { borderColor: color + '60' }]}>
              <Text style={[styles.modeText, { color: color }]}>{tournament.mode}</Text>
            </View>
            <View style={[styles.statusBadge, {
              backgroundColor: tournament.status === 'ongoing' ? C.green + '22' : C.gold + '22',
              borderColor: tournament.status === 'ongoing' ? C.green + '60' : C.gold + '60'
            }]}>
              <View style={[styles.dot, {
                backgroundColor: tournament.status === 'ongoing' ? C.green : C.gold
              }]} />
              <Text style={[styles.statusText, {
                color: tournament.status === 'ongoing' ? C.green : C.gold
              }]}>{tournament.status.toUpperCase()}</Text>
            </View>
          </View>

          {/* Name */}
          <Text style={styles.tournamentName}>{tournament.name}</Text>

          {/* PRIZE POOL - BIG */}
          <LinearGradient colors={['#FFD70015', '#ff572215']} style={styles.prizeCard}>
            <Text style={styles.prizeLabel}>🏆 PRIZE POOL</Text>
            <Text style={styles.prizeValue}>{tournament.prize_pool}</Text>
            <Text style={styles.organizer}>by {tournament.organizer_name}</Text>
          </LinearGradient>

          {/* My Entry Status */}
          {statusInfo && (
            <View style={[styles.myEntryCard, { borderColor: statusInfo.color + '50',
              backgroundColor: statusInfo.color + '15' }]}>
              <Text style={[styles.myEntryText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
              {myEntry?.status === 'approved' && myEntry?.slot_number && (
                <Text style={styles.slotBigText}>SLOT #{myEntry.slot_number}</Text>
              )}
            </View>
          )}

          {/* Quick Stats */}
          <View style={styles.statsGrid}>
            <View style={[styles.statBox, { borderColor: C.gold + '40' }]}>
              <Text style={styles.statIcon}>💰</Text>
              <Text style={styles.statValue}>{tournament.join_fee === 0 ? 'FREE' : `₹${tournament.join_fee}`}</Text>
              <Text style={styles.statLabel}>Entry Fee</Text>
            </View>
            <View style={[styles.statBox, { borderColor: color + '40' }]}>
              <Text style={styles.statIcon}>👥</Text>
              <Text style={[styles.statValue, { color: color }]}>
                {tournament.filled_slots}/{tournament.total_slots}
              </Text>
              <Text style={styles.statLabel}>Players</Text>
            </View>
            <View style={[styles.statBox, { borderColor: slotsLeft > 0 ? C.green + '40' : C.red + '40' }]}>
              <Text style={styles.statIcon}>{slotsLeft > 0 ? '🟢' : '🔴'}</Text>
              <Text style={[styles.statValue, { color: slotsLeft > 0 ? C.green : C.red }]}>
                {slotsLeft > 0 ? slotsLeft : 'FULL'}
              </Text>
              <Text style={styles.statLabel}>{slotsLeft > 0 ? 'Slots Left' : 'Tournament'}</Text>
            </View>
          </View>

          {/* Date Time */}
          <View style={[styles.infoCard, { borderColor: C.border }]}>
            <Ionicons name="calendar" size={20} color={color} />
            <Text style={styles.infoCardText}>{formatDate(tournament.tournament_date, tournament.tournament_time)}</Text>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            {['info', 'rules', 'players', 'payment'].map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabBtn, activeTab === tab && { borderBottomColor: color, borderBottomWidth: 2 }]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && { color: color }]}>
                  {tab === 'info' ? '📋 Info' : tab === 'rules' ? '📜 Rules' :
                    tab === 'players' ? `👥 Players (${approvedList.length})` : '💳 Payment'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab Content */}
          {activeTab === 'info' && (
            <View style={styles.tabContent}>
              <InfoRow icon="🎮" label="Game" value={tournament.game_type === 'freefire' ? 'Free Fire' : 'BGMI'} />
              <InfoRow icon="⚔️" label="Mode" value={tournament.mode} />
              <InfoRow icon="👤" label="Organizer" value={tournament.organizer_name} />
              <InfoRow icon="🎯" label="Total Slots" value={`${tournament.total_slots} Players`} />
              <InfoRow icon="📊" label="Filled" value={`${tournament.filled_slots} Players`} />
              <InfoRow icon="💰" label="Entry Fee" value={tournament.join_fee === 0 ? 'FREE ENTRY' : `₹${tournament.join_fee}`} />
            </View>
          )}

          {activeTab === 'rules' && (
            <View style={styles.tabContent}>
              <Text style={styles.rulesText}>{tournament.rules || 'No rules posted yet.'}</Text>
            </View>
          )}

          {activeTab === 'players' && (
            <View style={styles.tabContent}>
              {approvedList.length === 0 ? (
                <Text style={styles.emptyText}>No approved players yet.</Text>
              ) : (
                approvedList.map(p => (
                  <View key={p.id} style={[styles.playerRow,
                    p.device_id === deviceId && { borderColor: C.green + '60', backgroundColor: C.green + '10' }]}>
                    <View style={[styles.slotBadge, { backgroundColor: color }]}>
                      <Text style={styles.slotNo}>#{p.slot_number}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.playerName}>{p.game_name}</Text>
                      <Text style={styles.playerUid}>UID: {p.uid}</Text>
                    </View>
                    {p.device_id === deviceId && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youText}>YOU</Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === 'payment' && (
            <View style={styles.tabContent}>
              <Text style={styles.paymentNote}>
                📌 Send ₹{tournament.join_fee} to the UPI ID or scan QR below.{'\n'}
                After payment, note your UTR/Transaction ID and click JOIN to submit.
              </Text>
              {tournament.upi_id && (
                <View style={styles.upiBox}>
                  <Text style={styles.upiLabel}>UPI ID</Text>
                  <Text style={styles.upiValue}>{tournament.upi_id}</Text>
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={() => { /* copy */ Alert.alert('Copied!', tournament.upi_id); }}
                  >
                    <Ionicons name="copy-outline" size={16} color={color} />
                    <Text style={[styles.copyText, { color: color }]}>Copy</Text>
                  </TouchableOpacity>
                </View>
              )}
              {tournament.qr_image_url && (
                <View style={styles.qrContainer}>
                  <Text style={styles.qrLabel}>📱 Scan to Pay</Text>
                  <Image source={{ uri: tournament.qr_image_url }} style={styles.qrImage} resizeMode="contain" />
                </View>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionArea}>
            {!myEntry && slotsLeft > 0 && tournament.status !== 'completed' && (
              <TouchableOpacity
                style={[styles.mainActionBtn, { backgroundColor: color }]}
                onPress={() => navigation.navigate('JoinTournament', { tournament })}
              >
                <FontAwesome5 name="gamepad" size={18} color={C.white} />
                <Text style={styles.mainActionText}>JOIN TOURNAMENT</Text>
              </TouchableOpacity>
            )}
            {myEntry?.status === 'approved' && tournament.status === 'completed' && (
              <TouchableOpacity
                style={[styles.mainActionBtn, { backgroundColor: C.gold }]}
                onPress={() => navigation.navigate('Withdraw', { tournament, participant: myEntry })}
              >
                <FontAwesome5 name="trophy" size={18} color={C.bg} />
                <Text style={[styles.mainActionText, { color: C.bg }]}>CLAIM PRIZE</Text>
              </TouchableOpacity>
            )}
            {slotsLeft === 0 && !myEntry && (
              <View style={[styles.mainActionBtn, { backgroundColor: C.darkGray }]}>
                <Text style={styles.mainActionText}>TOURNAMENT FULL</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoRowIcon}>{icon}</Text>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <Text style={styles.infoRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  bannerContainer: { height: 240, position: 'relative' },
  banner: { width: '100%', height: 240, justifyContent: 'center', alignItems: 'center' },
  bannerFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 },
  backBtn: { position: 'absolute', top: 16, left: 16, backgroundColor: '#00000060',
    padding: 8, borderRadius: 12 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, marginTop: 4 },
  gameBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  gameBadgeText: { color: C.white, fontSize: 12, fontWeight: '800' },
  modeBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, backgroundColor: C.surface },
  modeText: { fontSize: 12, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  statusText: { fontSize: 11, fontWeight: '800' },
  tournamentName: { fontSize: 26, fontWeight: '900', color: C.white, marginBottom: 12,
    lineHeight: 32, letterSpacing: 0.5 },
  prizeCard: { borderRadius: 16, padding: 20, marginBottom: 14, borderWidth: 1,
    borderColor: C.gold + '30', alignItems: 'center' },
  prizeLabel: { fontSize: 12, color: C.gray, letterSpacing: 3, marginBottom: 6 },
  prizeValue: { fontSize: 38, fontWeight: '900', color: C.gold, textAlign: 'center',
    textShadowColor: C.gold, textShadowRadius: 12 },
  organizer: { fontSize: 13, color: C.gray, marginTop: 4 },
  myEntryCard: { borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1.5, alignItems: 'center' },
  myEntryText: { fontSize: 14, fontWeight: '700' },
  slotBigText: { fontSize: 28, fontWeight: '900', color: C.green, marginTop: 4 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statBox: { flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1 },
  statIcon: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '900', color: C.white },
  statLabel: { fontSize: 10, color: C.gray, marginTop: 2 },
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface,
    borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1 },
  infoCardText: { color: C.white, fontSize: 14, fontWeight: '600', flex: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2,
    borderBottomColor: 'transparent' },
  tabText: { color: C.gray, fontSize: 11, fontWeight: '700' },
  tabContent: { marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border + '50' },
  infoRowIcon: { fontSize: 18, marginRight: 12, width: 28 },
  infoRowLabel: { color: C.gray, fontSize: 13, flex: 1 },
  infoRowValue: { color: C.white, fontSize: 13, fontWeight: '700' },
  rulesText: { color: C.gray, fontSize: 14, lineHeight: 24, backgroundColor: C.surface,
    padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  emptyText: { color: C.gray, textAlign: 'center', marginVertical: 20, fontSize: 14 },
  playerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border, gap: 12 },
  slotBadge: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  slotNo: { color: C.white, fontWeight: '900', fontSize: 14 },
  playerName: { color: C.white, fontWeight: '700', fontSize: 14 },
  playerUid: { color: C.gray, fontSize: 11, marginTop: 2 },
  youBadge: { backgroundColor: C.green + '22', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: C.green + '60' },
  youText: { color: C.green, fontSize: 11, fontWeight: '900' },
  paymentNote: { color: C.gray, fontSize: 13, lineHeight: 22, backgroundColor: C.surface,
    padding: 14, borderRadius: 12, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  upiBox: { backgroundColor: C.surface, borderRadius: 12, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  upiLabel: { color: C.gray, fontSize: 12, width: '100%', marginBottom: 4 },
  upiValue: { color: C.white, fontSize: 17, fontWeight: '800', flex: 1 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  copyText: { fontWeight: '700', fontSize: 13 },
  qrContainer: { alignItems: 'center', backgroundColor: C.surface, borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  qrLabel: { color: C.white, fontWeight: '700', fontSize: 15, marginBottom: 16 },
  qrImage: { width: 200, height: 200, borderRadius: 12 },
  actionArea: { marginTop: 8 },
  mainActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16, gap: 10 },
  mainActionText: { color: C.white, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
});
