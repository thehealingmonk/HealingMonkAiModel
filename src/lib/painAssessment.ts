export interface PainArea {
  id: string;
  name: string;
  nameHi?: string; // Hindi translation
  label: string;
  labelHi?: string; // Hindi translation
  x: number;
  y: number;
  radius: number;
  positions: PosePosition[];
  icon: string;
}

export interface PosePosition {
  id: string;
  name: string;
  nameHi?: string; // Hindi translation (optional — not every position is translated yet)
  description: string;
  descriptionHi?: string; // Hindi translation
  voiceGuide: string;
  voiceGuideHi?: string; // Hindi voice guidance
  duration: number; // seconds
  imageX: number;
  imageY: number;
}

export const PAIN_AREAS: PainArea[] = [
  {
    id: 'neck',
    name: 'Neck',
    nameHi: 'गर्दन',
    label: 'Neck Pain',
    labelHi: 'गर्दन का दर्द',
    x: 50,
    y: 15,
    radius: 8,
    icon: '🔴',
    positions: [
      {
        id: 'neck_neutral',
        name: 'Neutral Neck',
        nameHi: 'तटस्थ गर्दन',
        description: 'Head straight, looking forward',
        descriptionHi: 'सिर सीधा, आगे देखते हुए',
        voiceGuide: 'Please look straight ahead and relax your neck. Keep your shoulders down.',
        voiceGuideHi: 'कृपया सीधे आगे देखें और अपनी गर्दन को आराम दें। अपने कंधों को नीचे रखें।',
        duration: 5,
        imageX: 50,
        imageY: 20,
      },
      {
        id: 'neck_turn_left',
        name: 'Turn Left',
        nameHi: 'बाईं ओर मुड़ें',
        description: 'Rotate head to the left',
        descriptionHi: 'सिर को बाईं ओर घुमाएं',
        voiceGuide: 'Now slowly turn your head to the left. Stop when you feel mild tension.',
        voiceGuideHi: 'अब धीरे-धीरे अपनी गर्दन को बाईं ओर घुमाएं। जब आप हल्का तनाव महसूस करें तो रुकें।',
        duration: 5,
        imageX: 50,
        imageY: 20,
      },
      {
        id: 'neck_turn_right',
        name: 'Turn Right',
        nameHi: 'दाईं ओर मुड़ें',
        description: 'Rotate head to the right',
        descriptionHi: 'सिर को दाईं ओर घुमाएं',
        voiceGuide: 'Turn your head to the right. Try to match the stretch from the left side.',
        voiceGuideHi: 'अपनी गर्दन को दाईं ओर घुमाएं। बाईं ओर से समान खिंचाव करने का प्रयास करें।',
        duration: 5,
        imageX: 50,
        imageY: 20,
      },
      {
        id: 'neck_tilt_forward',
        name: 'Tilt Forward',
        nameHi: 'आगे की ओर झुकें',
        description: 'Lean head forward',
        descriptionHi: 'सिर को आगे की ओर झुकाएं',
        voiceGuide: 'Gently tilt your head forward. Let gravity do the work, do not push.',
        voiceGuideHi: 'धीरे-धीरे अपनी गर्दन को आगे की ओर झुकाएं। गुरुत्वाकर्षण को काम करने दें, दबाएं नहीं।',
        duration: 5,
        imageX: 50,
        imageY: 20,
      },
    ],
  },
  {
    id: 'shoulder',
    name: 'Shoulder',
    label: 'Shoulder Pain',
    x: 65,
    y: 28,
    radius: 10,
    icon: '🔴',
    positions: [
      {
        id: 'shoulder_neutral',
        name: 'Neutral Posture',
        description: 'Arms at sides, natural posture',
        voiceGuide: 'Stand with your arms relaxed at your sides. Keep your shoulders back and down.',
        duration: 5,
        imageX: 50,
        imageY: 30,
      },
      {
        id: 'shoulder_raise_right',
        name: 'Raise Right Arm',
        description: 'Raise right arm to shoulder height',
        voiceGuide: 'Slowly raise your right arm to shoulder level. Hold it there.',
        duration: 5,
        imageX: 50,
        imageY: 30,
      },
      {
        id: 'shoulder_overhead_right',
        name: 'Raise Right Overhead',
        description: 'Raise right arm overhead',
        voiceGuide: 'Continue raising your right arm above your head. Stop if there is pain.',
        duration: 5,
        imageX: 50,
        imageY: 30,
      },
      {
        id: 'shoulder_raise_left',
        name: 'Raise Left Arm',
        description: 'Raise left arm to shoulder height',
        voiceGuide: 'Now raise your left arm to shoulder level. Match the height of your right arm.',
        duration: 5,
        imageX: 50,
        imageY: 30,
      },
    ],
  },
  {
    id: 'lower_back',
    name: 'Lower Back',
    label: 'Lower Back Pain',
    x: 50,
    y: 55,
    radius: 12,
    icon: '🔴',
    positions: [
      {
        id: 'back_neutral',
        name: 'Neutral Spine',
        description: 'Stand with neutral spine',
        voiceGuide: 'Stand straight with your feet shoulder-width apart. Maintain a neutral spine.',
        duration: 5,
        imageX: 50,
        imageY: 50,
      },
      {
        id: 'back_forward_bend',
        name: 'Forward Bend',
        description: 'Bend forward gently',
        voiceGuide: 'Slowly bend forward at the waist. Let your arms hang down. Stop at any pain.',
        duration: 5,
        imageX: 50,
        imageY: 50,
      },
      {
        id: 'back_backward',
        name: 'Backward Bend',
        description: 'Gently arch backward',
        voiceGuide: 'Slowly arch your back backward. Support your lower back with your hands.',
        duration: 5,
        imageX: 50,
        imageY: 50,
      },
      {
        id: 'back_rotation',
        name: 'Rotation',
        description: 'Rotate torso gently',
        voiceGuide: 'Rotate your torso to the right. Hold the position and notice any discomfort.',
        duration: 5,
        imageX: 50,
        imageY: 50,
      },
    ],
  },
  {
    id: 'knee',
    name: 'Knee',
    label: 'Knee Pain',
    x: 35,
    y: 75,
    radius: 10,
    icon: '🔴',
    positions: [
      {
        id: 'knee_standing',
        name: 'Standing',
        description: 'Stand with feet apart',
        voiceGuide: 'Stand with your feet shoulder-width apart. Distribute weight evenly.',
        duration: 5,
        imageX: 50,
        imageY: 70,
      },
      {
        id: 'knee_squat_partial',
        name: 'Partial Squat',
        description: 'Bend knees slightly',
        voiceGuide: 'Slowly bend your knees about halfway down. Stop if there is pain.',
        duration: 5,
        imageX: 50,
        imageY: 70,
      },
      {
        id: 'knee_squat_deep',
        name: 'Deep Squat',
        description: 'Squat as deep as comfortable',
        voiceGuide: 'Go deeper into the squat position. Only go as far as is comfortable.',
        duration: 5,
        imageX: 50,
        imageY: 70,
      },
      {
        id: 'knee_single_leg',
        name: 'Single Leg',
        description: 'Stand on one leg',
        voiceGuide: 'Lift your left leg and stand on your right leg for balance.',
        duration: 5,
        imageX: 50,
        imageY: 70,
      },
    ],
  },
  {
    id: 'hip',
    name: 'Hip',
    label: 'Hip Pain',
    x: 45,
    y: 50,
    radius: 10,
    icon: '🔴',
    positions: [
      {
        id: 'hip_neutral',
        name: 'Neutral Stance',
        description: 'Stand normally',
        voiceGuide: 'Stand with your feet shoulder-width apart in a natural posture.',
        duration: 5,
        imageX: 50,
        imageY: 50,
      },
      {
        id: 'hip_single_leg_left',
        name: 'Left Leg Stance',
        description: 'Stand on left leg',
        voiceGuide: 'Lift your right leg and balance on your left leg.',
        duration: 5,
        imageX: 50,
        imageY: 50,
      },
      {
        id: 'hip_single_leg_right',
        name: 'Right Leg Stance',
        description: 'Stand on right leg',
        voiceGuide: 'Lift your left leg and balance on your right leg.',
        duration: 5,
        imageX: 50,
        imageY: 50,
      },
      {
        id: 'hip_cross_body',
        name: 'Cross Body Stretch',
        description: 'Cross body hip stretch',
        voiceGuide: 'Bring one knee toward your opposite shoulder. Hold this stretch.',
        duration: 5,
        imageX: 50,
        imageY: 50,
      },
    ],
  },
];

export interface AssessmentSession {
  id: string;
  initialFullBodyAnalysis: FullBodyAnalysis;
  painAreas: PainAreaAssessment[];
  capturedImages: CapturedImage[];
  notes: string;
  createdAt: Date;
}

export interface FullBodyAnalysis {
  postureScore: number;
  mobilityScore: number;
  stabilityScore: number;
  overallScore: number;
  issues: string[];
  imageUrl?: string;
}

export interface PainAreaAssessment {
  areaId: string;
  areaName: string;
  severityLevel: number; // 1-10
  limitations: string[];
  positionImages: PositionImage[];
}

export interface PositionImage {
  positionId: string;
  positionName: string;
  imageUrl: string;
  timestamp: Date;
  analysis: string;
}

export interface CapturedImage {
  id: string;
  positionId: string;
  imageData: string; // base64
  timestamp: Date;
  metadata: {
    areaName: string;
    positionName: string;
    landmarks?: any;
  };
}
