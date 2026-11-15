
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "attention_items": {
                  Row: {
                    "created_at": string,"error": string | null,"id": string,"kind": string,"metadata": NonNullable<Json>,"resolved_at": string | null,"resolved_by": string | null,"status": string,"target_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"id"?: string,"kind": string,"metadata"?: NonNullable<Json>,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"target_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"id"?: string,"kind"?: string,"metadata"?: NonNullable<Json>,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"target_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_kind": string,"created_at": string,"id": string,"metadata": NonNullable<Json>,"target_id": string | null,"target_table": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_kind": string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"target_id"?: string | null,"target_table"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_kind"?: string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"target_id"?: string | null,"target_table"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"call_events": {
                  Row: {
                    "at": string,"call_id": string,"call_kind": string,"created_at": string,"event": string,"id": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "at": string,"call_id": string,"call_kind": string,"created_at"?: string,"event": string,"id"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "at"?: string,"call_id"?: string,"call_kind"?: string,"created_at"?: string,"event"?: string,"id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"parent_id": string | null,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"parent_id"?: string | null,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"parent_id"?: string | null,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"consents": {
                  Row: {
                    "accepted_at": string,"created_at": string,"document": string,"id": string,"updated_at": string,"user_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"created_at"?: string,"document": string,"id"?: string,"updated_at"?: string,"user_id": string,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"created_at"?: string,"document"?: string,"id"?: string,"updated_at"?: string,"user_id"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"deletion_requests": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"id": string,"requested_at": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"id"?: string,"requested_at"?: string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"id"?: string,"requested_at"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"device_tokens": {
                  Row: {
                    "created_at": string,"expo_token": string,"id": string,"last_seen_at": string,"platform": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expo_token": string,"id"?: string,"last_seen_at"?: string,"platform": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expo_token"?: string,"id"?: string,"last_seen_at"?: string,"platform"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "channel": string,"created_at": string,"data": NonNullable<Json>,"error": string | null,"id": string,"provider_ref": string | null,"retries": number,"status": string,"template_key": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": string,"created_at"?: string,"data"?: NonNullable<Json>,"error"?: string | null,"id"?: string,"provider_ref"?: string | null,"retries"?: number,"status": string,"template_key": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "channel"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"error"?: string | null,"id"?: string,"provider_ref"?: string | null,"retries"?: number,"status"?: string,"template_key"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"otp_sends": {
                  Row: {
                    "created_at": string,"id": number,"phone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"phone": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"phone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_settings": {
                  Row: {
                    "created_at": string,"key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"practitioner_categories": {
                  Row: {
                    "category_id": string,"created_at": string,"practitioner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"created_at"?: string,"practitioner_id": string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"practitioner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "practitioner_categories_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "practitioner_categories_practitioner_id_fkey"
      columns: ["practitioner_id"]
isOneToOne: false
      referencedRelation: "practitioners"
      referencedColumns: ["id"]
    }
                  ]
                },"practitioner_documents": {
                  Row: {
                    "created_at": string,"file_name": string,"id": string,"kind": string,"mime_type": string,"practitioner_id": string,"size_bytes": number,"storage_path": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_name": string,"id"?: string,"kind": string,"mime_type": string,"practitioner_id": string,"size_bytes": number,"storage_path": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"file_name"?: string,"id"?: string,"kind"?: string,"mime_type"?: string,"practitioner_id"?: string,"size_bytes"?: number,"storage_path"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "practitioner_documents_practitioner_id_fkey"
      columns: ["practitioner_id"]
isOneToOne: false
      referencedRelation: "practitioners"
      referencedColumns: ["id"]
    }
                  ]
                },"practitioner_status_history": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_kind": string,"created_at": string,"from_status": Database["public"]['Enums']["practitioner_status"],"id": string,"practitioner_id": string,"reason": string | null,"to_status": Database["public"]['Enums']["practitioner_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_kind": string,"created_at"?: string,"from_status": Database["public"]['Enums']["practitioner_status"],"id"?: string,"practitioner_id": string,"reason"?: string | null,"to_status": Database["public"]['Enums']["practitioner_status"]
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_kind"?: string,"created_at"?: string,"from_status"?: Database["public"]['Enums']["practitioner_status"],"id"?: string,"practitioner_id"?: string,"reason"?: string | null,"to_status"?: Database["public"]['Enums']["practitioner_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "practitioner_status_history_practitioner_id_fkey"
      columns: ["practitioner_id"]
isOneToOne: false
      referencedRelation: "practitioners"
      referencedColumns: ["id"]
    }
                  ]
                },"practitioners": {
                  Row: {
                    "address_full": string | null,"agreement_version": string | null,"approved_at": string | null,"assigned_reviewer_id": string | null,"bio": string | null,"city": string | null,"created_at": string,"credentials_text": string | null,"declaration_accepted": boolean,"display_name": string | null,"email": string | null,"gstin": string | null,"id": string,"languages": (string)[],"lat": number | null,"links": (string)[],"lng": number | null,"location": unknown,"offers_in_person": boolean,"offers_online": boolean,"photo_path": string | null,"pincode": string | null,"razorpay_account_id": string | null,"razorpay_account_status": string | null,"reapply_after": string | null,"residential_address": Json | null,"status": Database["public"]['Enums']["practitioner_status"],"submitted_at": string | null,"updated_at": string,"user_id": string,"video_bytes": number | null,"video_duration_seconds": number | null,"video_mime": string | null,"video_path": string | null,"years_experience": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address_full"?: string | null,"agreement_version"?: string | null,"approved_at"?: string | null,"assigned_reviewer_id"?: string | null,"bio"?: string | null,"city"?: string | null,"created_at"?: string,"credentials_text"?: string | null,"declaration_accepted"?: boolean,"display_name"?: string | null,"email"?: string | null,"gstin"?: string | null,"id"?: string,"languages"?: (string)[],"lat"?: number | null,"links"?: (string)[],"lng"?: number | null,"location"?: never,"offers_in_person"?: boolean,"offers_online"?: boolean,"photo_path"?: string | null,"pincode"?: string | null,"razorpay_account_id"?: string | null,"razorpay_account_status"?: string | null,"reapply_after"?: string | null,"residential_address"?: Json | null,"status"?: Database["public"]['Enums']["practitioner_status"],"submitted_at"?: string | null,"updated_at"?: string,"user_id": string,"video_bytes"?: number | null,"video_duration_seconds"?: number | null,"video_mime"?: string | null,"video_path"?: string | null,"years_experience"?: number | null
                  }
                  Update: {
                    "address_full"?: string | null,"agreement_version"?: string | null,"approved_at"?: string | null,"assigned_reviewer_id"?: string | null,"bio"?: string | null,"city"?: string | null,"created_at"?: string,"credentials_text"?: string | null,"declaration_accepted"?: boolean,"display_name"?: string | null,"email"?: string | null,"gstin"?: string | null,"id"?: string,"languages"?: (string)[],"lat"?: number | null,"links"?: (string)[],"lng"?: number | null,"location"?: never,"offers_in_person"?: boolean,"offers_online"?: boolean,"photo_path"?: string | null,"pincode"?: string | null,"razorpay_account_id"?: string | null,"razorpay_account_status"?: string | null,"reapply_after"?: string | null,"residential_address"?: Json | null,"status"?: Database["public"]['Enums']["practitioner_status"],"submitted_at"?: string | null,"updated_at"?: string,"user_id"?: string,"video_bytes"?: number | null,"video_duration_seconds"?: number | null,"video_mime"?: string | null,"video_path"?: string | null,"years_experience"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"full_name": string | null,"id": string,"phone": string | null,"photo_path": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"full_name"?: string | null,"id": string,"phone"?: string | null,"photo_path"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"full_name"?: string | null,"id"?: string,"phone"?: string | null,"photo_path"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"review_notes": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"practitioner_id": string,"staff_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"practitioner_id": string,"staff_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"practitioner_id"?: string,"staff_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_notes_practitioner_id_fkey"
      columns: ["practitioner_id"]
isOneToOne: false
      referencedRelation: "practitioners"
      referencedColumns: ["id"]
    }
                  ]
                },"staff": {
                  Row: {
                    "active": boolean,"created_at": string,"email": string,"role": Database["public"]['Enums']["staff_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"email": string,"role": Database["public"]['Enums']["staff_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"email"?: string,"role"?: Database["public"]['Enums']["staff_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"trial_calls": {
                  Row: {
                    "created_at": string,"hms_room_id": string | null,"hour_reminder_sent": boolean,"id": string,"notes": string | null,"outcome_recorded_at": string | null,"pick_reminder_sent": boolean,"practitioner_id": string,"proposed_at": string | null,"proposed_slots": (string)[],"reschedule_used": boolean,"reviewer_id": string,"scheduled_at": string | null,"status": Database["public"]['Enums']["trial_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"hms_room_id"?: string | null,"hour_reminder_sent"?: boolean,"id"?: string,"notes"?: string | null,"outcome_recorded_at"?: string | null,"pick_reminder_sent"?: boolean,"practitioner_id": string,"proposed_at"?: string | null,"proposed_slots"?: (string)[],"reschedule_used"?: boolean,"reviewer_id": string,"scheduled_at"?: string | null,"status"?: Database["public"]['Enums']["trial_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"hms_room_id"?: string | null,"hour_reminder_sent"?: boolean,"id"?: string,"notes"?: string | null,"outcome_recorded_at"?: string | null,"pick_reminder_sent"?: boolean,"practitioner_id"?: string,"proposed_at"?: string | null,"proposed_slots"?: (string)[],"reschedule_used"?: boolean,"reviewer_id"?: string,"scheduled_at"?: string | null,"status"?: Database["public"]['Enums']["trial_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trial_calls_practitioner_id_fkey"
      columns: ["practitioner_id"]
isOneToOne: false
      referencedRelation: "practitioners"
      referencedColumns: ["id"]
    }
                  ]
                },"verification_checks": {
                  Row: {
                    "attempt_times": (string)[],"attempts": number,"bank_account_encrypted": string | null,"checked_at": string | null,"created_at": string,"id": string,"ifsc": string | null,"kind": string,"last_error": string | null,"masked_ref": string | null,"name_match_score": number | null,"pan_encrypted": string | null,"practitioner_id": string,"provider_ref": string | null,"status": string,"updated_at": string,"verified_name": string | null,"year_of_birth": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_times"?: (string)[],"attempts"?: number,"bank_account_encrypted"?: string | null,"checked_at"?: string | null,"created_at"?: string,"id"?: string,"ifsc"?: string | null,"kind": string,"last_error"?: string | null,"masked_ref"?: string | null,"name_match_score"?: number | null,"pan_encrypted"?: string | null,"practitioner_id": string,"provider_ref"?: string | null,"status"?: string,"updated_at"?: string,"verified_name"?: string | null,"year_of_birth"?: number | null
                  }
                  Update: {
                    "attempt_times"?: (string)[],"attempts"?: number,"bank_account_encrypted"?: string | null,"checked_at"?: string | null,"created_at"?: string,"id"?: string,"ifsc"?: string | null,"kind"?: string,"last_error"?: string | null,"masked_ref"?: string | null,"name_match_score"?: number | null,"pan_encrypted"?: string | null,"practitioner_id"?: string,"provider_ref"?: string | null,"status"?: string,"updated_at"?: string,"verified_name"?: string | null,"year_of_birth"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "verification_checks_practitioner_id_fkey"
      columns: ["practitioner_id"]
isOneToOne: false
      referencedRelation: "practitioners"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "my_verification_checks": {
                  Row: {
                    "attempt_times": (string)[],"attempts": number,"checked_at": string | null,"kind": string,"masked_ref": string | null,"name_match_score": number | null,"status": string,"verified_name": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "apply_practitioner_transition":
{ Args: { "p_action": string,"p_actor": string,"p_actor_kind": string,"p_from": Database["public"]['Enums']["practitioner_status"],"p_id": string,"p_patch"?: Json,"p_reason": string,"p_to": Database["public"]['Enums']["practitioner_status"] }; Returns: boolean
                           },
"can_write_practitioner_object":
{ Args: { "p_name": string }; Returns: boolean
                           },
"invoke_job":
{ Args: { "p_job": string }; Returns: undefined
                           },
"is_staff":
{ Args: { "roles"?: (Database["public"]['Enums']["staff_role"])[] }; Returns: boolean
                           },
"owns_editable_practitioner":
{ Args: { "p_id": string }; Returns: boolean
                           },
"owns_practitioner":
{ Args: { "p_id": string }; Returns: boolean
                           },
"reveal_bank_account":
{ Args: { "p_check_id": string }; Returns: string
                           },
"reveal_pan":
{ Args: { "p_check_id": string }; Returns: string
                           },
"store_bank_account":
{ Args: { "p_account": string,"p_check_id": string,"p_ifsc": string }; Returns: undefined
                           },
"store_pan":
{ Args: { "p_check_id": string,"p_pan": string }; Returns: undefined
                           },
"write_audit":
{ Args: { "p_action": string,"p_actor_id": string,"p_actor_kind": string,"p_metadata": Json,"p_target_id": string,"p_target_table": string }; Returns: undefined
                           }
          }
          Enums: {
            "practitioner_status": "draft"|"submitted"|"in_review"|"changes_requested"|"trial_scheduled"|"approved"|"rejected"|"suspended","staff_role": "reviewer"|"support"|"finance"|"super_admin","trial_status": "proposed"|"scheduled"|"completed"|"missed"|"expired"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "practitioner_status": ["draft", "submitted", "in_review", "changes_requested", "trial_scheduled", "approved", "rejected", "suspended"],"staff_role": ["reviewer", "support", "finance", "super_admin"],"trial_status": ["proposed", "scheduled", "completed", "missed", "expired", "cancelled"]
          }
        }
} as const
