// screens/JoinScreen.js
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, Image, ActivityIndicator, KeyboardAvoidingView, Platform,
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

export default function JoinScreen({ route, navigation }) {
  const { tournament } = route.params;
  const { deviceId } = useApp();
  const color = tournament.game_type === 'bgmi' ? C.blue : C.primary;

  const [gameName, setGameName] = useState('');
  const [uid, setUid] = useState('');
  const [utr, setUtr] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [hasStylishName, setHasStylishName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);

  async function pickScreenshot() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload game name screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) setScreenshot(result.assets[0].uri);
  }

  async function handleSubmit() {
    if (!gameName.trim()) return Alert.alert('Missing', 'Enter your in-game name.');
    if (!uid.trim()) return Alert.alert('Missing', 'Enter your UID.');
    if (!utr.trim()) return Alert.alert('Missing', 'Enter your UTR / Transaction ID.');
    if (hasStylishName && !screenshot) return Alert.alert('Missing', 'Upload screenshot of your game name.');
    if (!agreed) return Alert.alert('Agree Required', 'You must agree to tournament rules before joining.');

    setSubmitting(true);
    try {
      // Check if already joined
      const { data: existing } = await supabase
        .from('participants')
        .select('id, status')
        .eq('tournament_id', tournament.id)
        .eq('device_id', deviceId)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'kicked') {
          Alert.alert('Banned', 'You have been removed from this tournament. No refund will be issued.');
          setSubmitting(false); return;
        }
        Alert.alert('Already Joined', 'You have already submitted a join request for this tournament.');
        setSubmitting(false); return;
      }

      // Check UID duplicate
      const { data: uidCheck } = await supabase
        .from('participants')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('uid', uid.trim())
        .maybeSingle();

      if (uidCheck) {
        Alert.alert('UID Already Registered', 'This UID is already registered in this tournament.');
        setSubmitting(false); return;
      }

      // Upload screenshot if provided
      let screenshotUrl = null;
      if (screenshot) {
        const path = `${tournament.id}/${uuidv4()}.jpg`;
        screenshotUrl = await uploadImage('game-screenshots', path, screenshot);
      }

      // Insert participant
      const { error } = await supabase.from('participants').insert({
        tournament_id: tournament.id,
        game_name: gameName.trim(),
        uid: uid.trim(),
        utr_number: utr.trim(),
        screenshot_url: screenshotUrl,
        device_id: deviceId,
        status: 'pending',
      });

      if (error) throw error;

      Alert.alert(
        '🎉 Request Submitted!',
        'Your join request has been submitted.\n\nAdmin will verify your payment and approve your slot.\n\nCheck back to see your slot number!',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <LinearGradient colors={[color + '30', '#080810']} style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={C.white} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.headerTitle}>JOIN TOURNAMENT</Text>
              <Text style={styles.headerSub} numberOfLines={1}>{tournament.name}</Text>
            </View>
          </LinearGradient>

          <View style={styles.content}>
            {/* Fee Notice */}
            {tournament.join_fee > 0 && (
              <View style={[styles.feeNotice, { borderColor: C.gold + '50' }]}>
                <Text style={styles.feeText}>💰 Pay ₹{tournament.join_fee} first, then submit UTR</Text>
              </View>
            )}

            {/* Payment QR */}
            {(tournament.qr_image_url || tournament.upi_id) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>💳 Payment Details</Text>
                {tournament.upi_id && (
                  <View style={styles.upiBox}>
                    <Text style={styles.upiLabel}>UPI ID:</Text>
                    <Text style={styles.upiValue}>{tournament.upi_id}</Text>
                  </View>
                )}
                {tournament.qr_image_url && (
                  <View style={styles.qrBox}>
                    <Text style={styles.qrNote}>Scan QR to pay</Text>
                    <Image source={{ uri: tournament.qr_image_url }} style={styles.qrImg} resizeMode="contain" />
                  </View>
                )}
              </View>
            )}

            {/* Form */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📋 Your Details</Text>

              <Text style={styles.label}>In-Game Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your exact game name"
                placeholderTextColor={C.gray}
                value={gameName}
                onChangeText={setGameName}
              />

              {/* Stylish name toggle */}
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setHasStylishName(!hasStylishName)}
              >
                <View style={[styles.checkbox, hasStylishName && { backgroundColor: color, borderColor: color }]}>
                  {hasStylishName && <Ionicons name="checkmark" size={14} color={C.white} />}
                </View>
                <Text style={styles.toggleText}>My name has special/stylish characters</Text>
              </TouchableOpacity>

              {hasStylishName && (
                <>
                  <Text style={styles.label}>Game Name Screenshot *</Text>
                  <TouchableOpacity style={styles.uploadBtn} onPress={pickScreenshot}>
                    {screenshot ? (
                      <Image source={{ uri: screenshot }} style={styles.previewImg} resizeMode="cover" />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={28} color={C.gray} />
                        <Text style={styles.uploadText}>Tap to upload screenshot</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              <Text style={styles.label}>Player UID *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your UID"
                placeholderTextColor={C.gray}
                value={uid}
                onChangeText={setUid}
                keyboardType="default"
              />

              <Text style={styles.label}>UTR / Transaction ID *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter UTR number after payment"
                placeholderTextColor={C.gray}
                value={utr}
                onChangeText={setUtr}
              />
              <Text style={styles.helperText}>
                💡 UTR is the 12-digit reference number from your UPI payment
              </Text>
            </View>

            {/* Rules Summary */}
            <View style={[styles.section, { borderColor: C.primary + '30', backgroundColor: C.primary + '08' }]}>
              <Text style={[styles.sectionTitle, { color: C.primary }]}>⚠️ Important Rules</Text>
              <Text style={styles.ruleText}>• No refunds on kick or disqualification</Text>
              <Text style={styles.ruleText}>• UTR must match your actual payment</Text>
              <Text style={styles.ruleText}>• Sending proxy players = instant kick</Text>
              <Text style={styles.ruleText}>• Max 5 withdrawal attempts allowed</Text>
              <Text style={styles.ruleText}>• 24-hour cooldown between withdrawal attempts</Text>
            </View>

            {/* Agreement */}
            <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(!agreed)}>
              <View style={[styles.checkbox, agreed && { backgroundColor: C.green, borderColor: C.green }]}>
                {agreed && <Ionicons name="checkmark" size={14} color={C.white} />}
              </View>
              <Text style={styles.agreeText}>
                I have read and agree to all tournament rules and conditions
              </Text>
            </TouchableOpacity>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: agreed ? color : C.darkGray }]}
              onPress={handleSubmit}
              disabled={submitting || !agreed}
            >
              {submitting ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <>
                  <Ionicons name="send" size={18} color={C.white} />
                  <Text style={styles.submitText}>SUBMIT JOIN REQUEST</Text>
                </>
              )}
            </TouchableOpacity>
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
  feeNotice: { backgroundColor: C.gold + '15', borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1 },
  feeText: { color: C.gold, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  section: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: C.border },
  sectionTitle: { color: C.white, fontSize: 15, fontWeight: '800', marginBottom: 14, letterSpacing: 0.5 },
  upiBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  upiLabel: { color: C.gray, fontSize: 13 },
  upiValue: { color: C.white, fontSize: 16, fontWeight: '800' },
  qrBox: { alignItems: 'center', marginTop: 8 },
  qrNote: { color: C.gray, fontSize: 12, marginBottom: 10 },
  qrImg: { width: 180, height: 180, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  label: { color: C.gray, fontSize: 13, marginBottom: 7, marginTop: 4, fontWeight: '600' },
  input: { backgroundColor: C.card, color: C.white, borderRadius: 12, padding: 14,
    fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center' },
  toggleText: { color: C.gray, fontSize: 13 },
  uploadBtn: { backgroundColor: C.card, borderRadius: 12, borderWidth: 2, borderColor: C.border,
    borderStyle: 'dashed', height: 140, justifyContent: 'center', alignItems: 'center',
    marginBottom: 10, overflow: 'hidden' },
  previewImg: { width: '100%', height: '100%' },
  uploadText: { color: C.gray, fontSize: 13, marginTop: 8 },
  helperText: { color: C.gray, fontSize: 11, marginBottom: 10, paddingHorizontal: 4 },
  ruleText: { color: C.gray, fontSize: 13, marginBottom: 6, lineHeight: 20 },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20,
    backgroundColor: C.surface, padding: 14, borderRadius: 12 },
  agreeText: { color: C.white, fontSize: 13, flex: 1, lineHeight: 20 },
  submitBtn: { paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10 },
  submitText: { color: C.white, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
});
