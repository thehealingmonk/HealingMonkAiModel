import { Patient } from '@/lib/server/models/Patient';

/**
 * True when a patient login is trusted to see the clinic records that share its
 * email: it was provisioned by staff (admin set its password from the patient
 * record, or an admin created it), never merely self-registered — a self-signup
 * email is unverified, so trusting it would let anyone claim another person's
 * reports, appointments and payments by registering with their address.
 */
export function isLinkedPatient(user: any): boolean {
  if (!user || user.role !== 'patient' || !user.email) return false;
  return user.patientLinked === true || Boolean(user.createdBy);
}

/** Clinic Patient ids that belong to this (linked) patient login. */
export async function myPatientIds(user: any): Promise<any[]> {
  if (!isLinkedPatient(user)) return [];
  const patients = await Patient.find({ email: String(user.email).toLowerCase() }).select('_id');
  return patients.map((p: any) => p._id);
}
