// screens/WithdrawScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Alert, Image, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase, uploadImage, uuidv4 } from '../lib/supabase';
import { useApp } from '../App';

const C = {
  bg: '#080810', surface: '#0e0e1c', card: '#111120',
  border: '#1e1e35', primary: '#ff5722', gold: '#FFD700',
  blue: '#2979ff', green: '#00e676', red: '#ff1744',
  white: '#ffffff', gray: '#7777aa', darkGray: '#2a2a45',
};

const MAX_ATTEMPTS = 5;
const COOLDOWN_HOURS = 24;

export default function WithdrawScreen({ route, navigation }) {
  const { tournament, participant } = route.params;
  const { deviceId } = useApp();
  const [qrUri, setQrUri] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [existingWithdrawal, setExistingWithdrawal] = useState(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkWithdrawalStatus();
  }, []);

  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setInterval(() => {
        setCooldownRemaining(prev => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownRemaining]);

  async function checkWithdrawalStatus() {
    setLoading(true);
    const { data } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('tournament_id', tournament.id)
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setExistingWithdrawal(data);
      if (data.status === 'pending' || data.attempt_count >= MAX_ATTEMPTS) {
        // Check cooldown
        const lastAttempt = new Date(data.last_attempt_at);
        const now = new Date();
        const diffMs = now - lastAttempt;
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours < COOLDOWN_HOURS) {
          const remainingMs = (COOLDOWN_HOURS * 60 * 60 * 1000) - diffMs;
          setCooldownRemaining(Math.ceil(remainingMs / 1000));
        }
      }
    }
    setLoading(false);
  }

  async function pickQR() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (!result.canceled) setQrUri(result.assets[0].uri);
  }

  async function handleSubmit() {
    if (!qrUri) return Alert.alert('Missing', 'Upload your UPI QR code to receive prize money.');

    // Double-check limits
    const { data: existing } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('tournament_id', tournament.id)
      .eq('device_id', deviceId)
      .order('last_attempt_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.attempt_count >= MAX_ATTEMPTS) {
        Alert.alert('❌ Limit Reached', `You have used all ${MAX_ATTEMPTS} withdrawal attempts for this tournament.`);
        return;
      }
      const lastAttempt = new Date(existing.last_attempt_at);
      const diffMs = new Date() - lastAttempt;
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours < COOLDOWN_HOURS) {
        const rem = Math.ceil((COOLDOWN_HOURS * 60 * 60 * 1000 - diffMs) / 1000);
        setCooldownRemaining(rem);
        Alert.alert('⏳ Please Wait', `You must wait ${formatTime(rem)} before trying again.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      // Upload winner QR
      const path = `winners/${tournament.id}/${uuidv4()}.jpg`;
      const qrUrl = await uploadImage('winner-qr', path, qrUri);

      if (existing) {
        // Update existing record
        await supabase.from('withdrawals').update({
          winner_qr_url: qrUrl,
          attempt_count: existing.attempt_count + 1,
          last_attempt_at: new Date().toISOString(),
          status: 'pending',
        }).eq('id', existing.id);
      } else {
        // Create new withdrawal request
        await supabase.from('withdrawals').insert({
          tournament_id: tournament.id,
          participant_id: participant?.id,
          game_name: participant?.game_name || '',
          uid: participant?.uid || '',
          device_id: deviceId,
          winner_qr_url: qrUrl,
          attempt_count: 1,
          last_attempt_at: new Date().toISOString(),
          status: 'pending',
        });
      }

      Alert.alert(
        '🎉 Withdrawal Submitted!',
        'Admin will verify your Game Name & UID and send the prize money to your QR code.\n\nThis may take some time.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to submit withdrawal.');
    } finally {
      setSubmitting(false);
    }
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  }

  if (loading) return <View style={styles.safe}><ActivityIndicator color={C.primary} style={{ marginTop: 80 }} /></View>;

  const attemptsLeft = MAX_ATTEMPTS - (existingWithdrawal?.attempt_count || 0);
  const isPaid = existingWithdrawal?.status === 'paid';
  const isPending = existingWithdrawal?.status === 'pending';
  const inCooldown = cooldownRemaining > 0;
  const blockedPermanently = attemptsLeft <= 0;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Header */}
          <LinearGradient colors={[C.gold + '25', '#080810']} style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={C.white} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.headerTitle}>🏆 CLAIM PRIZE</Text>
              <Text style={styles.headerSub} numberOfLines={1}>{tournament.name}</Text>
            </View>
          </LinearGradient>

          <View style={styles.content}>
            {/* Prize Info */}
            <View style={styles.prizeBox}>
              <Text style={styles.prizeLabel}>PRIZE POOL</Text>
              <Text style={styles.prizeValue}>{tournament.prize_pool}</Text>
            </View>

            {/* Attempt Counter */}
            <View style={[styles.infoCard, { borderColor: attemptsLeft > 2 ? C.green + '50' : C.red + '50' }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoCardLabel}>Withdrawal Attempts</Text>
                <Text style={[styles.infoCardValue, { color: attemptsLeft > 2 ? C.green : C.red }]}>
                  {existingWithdrawal?.attempt_count || 0} used / {MAX_ATTEMPTS} max
                </Text>
              </View>
              <View style={styles.attemptBubbles}>
                {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                  <View key={i} style={[styles.bubble,
                    { backgroundColor: i < (existingWithdrawal?.attempt_count || 0) ? C.red : C.darkGray }]} />
                ))}
              </View>
            </View>

            {/* Cooldown Timer */}
            {inCooldown && (
              <View style={[styles.warningCard, { borderColor: C.gold + '50' }]}>
                <Ionicons name="time" size={24} color={C.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.warnTitle, { color: C.gold }]}>⏳ Cooldown Active</Text>
                  <Text style={[styles.warnText, { color: C.gold, fontSize: 20, fontWeight: '900' }]}>
                    {formatTime(cooldownRemaining)}
                  </Text>
                  <Text style={styles.warnSub}>Wait {COOLDOWN_HOURS}h between attempts</Text>
                </View>
              </View>
            )}

            {/* Paid Status */}
            {isPaid && (
              <View style={[styles.warningCard, { borderColor: C.green + '60', backgroundColor: C.green + '10' }]}>
                <Ionicons name="checkmark-circle" size={32} color={C.green} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.warnTitle, { color: C.green }]}>✅ Prize Sent!</Text>
                  <Text style={styles.warnSub}>Admin has sent your prize. Check your UPI.</Text>
                </View>
              </View>
            )}

            {/* Permanently Blocked */}
            {blockedPermanently && !isPaid && (
              <View style={[styles.warningCard, { borderColor: C.red + '60', backgroundColor: C.red + '10' }]}>
                <Ionicons name="close-circle" size={32} color={C.red} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.warnTitle, { color: C.red }]}>❌ Max Attempts Reached</Text>
                  <Text style={styles.warnSub}>You have used all {MAX_ATTEMPTS} withdrawal attempts.</Text>
                </View>
              </View>
            )}

            {/* Pending Notice */}
            {isPending && !inCooldown && (
              <View style={[styles.warningCard, { borderColor: C.gold + '50' }]}>
                <Ionicons name="hourglass" size={24} color={C.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.warnTitle, { color: C.gold }]}>⏳ Pending Admin Review</Text>
                  <Text style={styles.warnSub}>Admin is verifying. You can resubmit after cooldown.</Text>
                </View>
              </View>
            )}

            {/* My Entry Info */}
            {participant && (
              <View style={styles.myEntryBox}>
                <Text style={styles.meLabel}>Your Registered Details</Text>
                <Text style={styles.meValue}>🎮 {participant.game_name}</Text>
                <Text style={styles.meValue}>🆔 UID: {participant.uid}</Text>
                {participant.slot_number && (
                  <Text style={styles.meValue}>🎯 Slot: #{participant.slot_number}</Text>
                )}
                <Text style={styles.meNote}>Admin will verify these before sending prize.</Text>
              </View>
            )}

            {/* QR Upload - Only if not paid and not blocked */}
            {!isPaid && !blockedPermanently && !inCooldown && (
              <>
                <Text style={styles.sectionTitle}>📱 Your UPI QR Code</Text>
                <Text style={styles.sectionSub}>
                  Upload your UPI QR code. Admin will scan it to send prize money.
                </Text>

                <TouchableOpacity style={styles.qrUploadBtn} onPress={pickQR}>
                  {qrUri ? (
                    <Image source={{ uri: qrUri }} style={styles.qrPreview} resizeMode="contain" />
                  ) : (
                    <>
                      <Ionicons name="qr-code-outline" size={40} color={C.gray} />
                      <Text style={styles.qrUploadText}>Tap to upload your QR code</Text>
                      <Text style={[styles.qrUploadText, { fontSize: 11, marginTop: 4 }]}>
                        PhonePe / GPay / Paytm QR accepted
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {qrUri && (
                  <TouchableOpacity style={styles.changeQr} onPress={pickQR}>
                    <Ionicons name="refresh" size={16} color={C.primary} />
                    <Text style={[styles.qrUploadText, { color: C.primary }]}>Change QR</Text>
                  </TouchableOpacity>
                )}

                {/* Rules Reminder */}
                <View style={styles.rulesReminder}>
                  <Text style={styles.rulesReminderTitle}>⚠️ Rules Before Claiming</Text>
                  <Text style={styles.rulesReminderText}>
                    • Your Game Name & UID must match exactly{'\n'}
                    • Fake entries will be permanently rejected{'\n'}
                    • Max {MAX_ATTEMPTS} attempts allowed per tournament{'\n'}
                    • {COOLDOWN_HOURS}h cooldown between each attempt{'\n'}
                    • Admin decision is final
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, !qrUri && { opacity: 0.5 }]}
                  onPress={handleSubmit}
                  disabled={submitting || !qrUri}
                >
                  {submitting ? <ActivityIndicator color={C.bg} /> : (
                    <>
                      <Ionicons name="trophy" size={20} color={C.bg} />
                      <Text style={styles.submitText}>
                        {existingWithdrawal ? `RESUBMIT (${attemptsLeft} left)` : 'CLAIM MY PRIZE'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingTop: 16, paddingBottom: 24, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { backgroundColor: '#00000040', padding: 8, borderRadius: 10 },
  headerTitle: { color: C.white, fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  headerSub: { color: C.gray, fontSize: 12, marginTop: 2 },
  content: { padding: 16 },
  prizeBox: { backgroundColor: C.gold + '15', borderRadius: 16, padding: 20,
    alignItems: 'center', borderWidth: 1, borderColor: C.gold + '40', marginBottom: 16 },
  prizeLabel: { color: C.gray, fontSize: 12, letterSpacing: 3, marginBottom: 4 },
  prizeValue: { color: C.gold, fontSize: 34, fontWeight: '900',
    textShadowColor: C.gold, textShadowRadius: 10 },
  infoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1 },
  infoCardLabel: { color: C.gray, fontSize: 12, marginBottom: 4 },
  infoCardValue: { fontSize: 15, fontWeight: '800' },
  attemptBubbles: { flexDirection: 'row', gap: 6 },
  bubble: { width: 14, height: 14, borderRadius: 7 },
  warningCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.gold + '10',
    borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1 },
  warnTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  warnText: { fontSize: 14, fontWeight: '700' },
  warnSub: { color: C.gray, fontSize: 12, marginTop: 2 },
  myEntryBox: { backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: C.border },
  meLabel: { color: C.gray, fontSize: 12, marginBottom: 8, fontWeight: '600' },
  meValue: { color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  meNote: { color: C.gray, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  sectionTitle: { color: C.white, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  sectionSub: { color: C.gray, fontSize: 13, marginBottom: 14, lineHeight: 20 },
  qrUploadBtn: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 2,
    borderColor: C.border, borderStyle: 'dashed', height: 200, justifyContent: 'center',
    alignItems: 'center', marginBottom: 8, overflow: 'hidden' },
  qrPreview: { width: '100%', height: '100%' },
  qrUploadText: { color: C.gray, fontSize: 14, marginTop: 10 },
  changeQr: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 14 },
  rulesReminder: { backgroundColor: C.red + '10', borderRadius: 14, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: C.red + '30' },
  rulesReminderTitle: { color: C.red, fontWeight: '800', fontSize: 14, marginBottom: 8 },
  rulesReminderText: { color: C.gray, fontSize: 13, lineHeight: 22 },
  submitBtn: { backgroundColor: C.gold, paddingVertical: 16, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  submitText: { color: C.bg, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
});
