// Generated from deployed schema by Supabase postgrest-typegen. Do not edit.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      allergies: {
        Row: {
          allergen: string
          id: string
          medical_record_id: string
          reaction: string | null
          severity: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          allergen: string
          id?: string
          medical_record_id: string
          reaction?: string | null
          severity?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          allergen?: string
          id?: string
          medical_record_id?: string
          reaction?: string | null
          severity?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allergies_medical_record_id_user_id_fkey"
            columns: ["medical_record_id", "user_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_hash: string | null
          metadata: NonNullable<Json>
          resource_id: string | null
          resource_type: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: NonNullable<Json>
          resource_id?: string | null
          resource_type: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: NonNullable<Json>
          resource_id?: string | null
          resource_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      diagnoses: {
        Row: {
          code: string | null
          diagnosed_at: string | null
          id: string
          medical_record_id: string
          name: string
          status: string | null
          user_id: string
        }
        Insert: {
          code?: string | null
          diagnosed_at?: string | null
          id?: string
          medical_record_id: string
          name: string
          status?: string | null
          user_id: string
        }
        Update: {
          code?: string | null
          diagnosed_at?: string | null
          id?: string
          medical_record_id?: string
          name?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnoses_medical_record_id_user_id_fkey"
            columns: ["medical_record_id", "user_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      doctor_notes: {
        Row: {
          id: string
          medical_record_id: string
          text: string
          user_id: string
        }
        Insert: {
          id?: string
          medical_record_id: string
          text: string
          user_id: string
        }
        Update: {
          id?: string
          medical_record_id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_notes_medical_record_id_user_id_fkey"
            columns: ["medical_record_id", "user_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      document_pages: {
        Row: {
          created_at: string
          document_id: string
          height: number
          id: string
          native_text_used: boolean
          page_number: number
          rotation: number
          skew_angle: number
          user_id: string
          width: number
        }
        Insert: {
          created_at?: string
          document_id: string
          height: number
          id?: string
          native_text_used: boolean
          page_number: number
          rotation?: number
          skew_angle?: number
          user_id: string
          width: number
        }
        Update: {
          created_at?: string
          document_id?: string
          height?: number
          id?: string
          native_text_used?: boolean
          page_number?: number
          rotation?: number
          skew_angle?: number
          user_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_document_id_user_id_fkey"
            columns: ["document_id", "user_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      document_text_blocks: {
        Row: {
          bbox: Json | null
          block_index: number
          confidence: number | null
          created_at: string
          document_id: string
          id: string
          page_id: string
          search_vector: unknown
          source_type: string
          text: string
          user_id: string
        }
        Insert: {
          bbox?: Json | null
          block_index: number
          confidence?: number | null
          created_at?: string
          document_id: string
          id?: string
          page_id: string
          search_vector?: never
          source_type: string
          text: string
          user_id: string
        }
        Update: {
          bbox?: Json | null
          block_index?: number
          confidence?: number | null
          created_at?: string
          document_id?: string
          id?: string
          page_id?: string
          search_vector?: never
          source_type?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_text_blocks_page_id_document_id_user_id_fkey"
            columns: ["page_id", "document_id", "user_id"]
            isOneToOne: false
            referencedRelation: "document_pages"
            referencedColumns: ["id", "document_id", "user_id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          display_name: string
          document_type: string | null
          event_date: string | null
          extraction_provider: string | null
          extraction_version: string | null
          file_size: number
          id: string
          mime_type: string
          normalized_storage_path: string | null
          ocr_provider: string | null
          ocr_version: string | null
          original_filename: string
          processing_error_code: string | null
          processing_error_message: string | null
          processing_status: Database["public"]["Enums"]["document_status"]
          sha256: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          document_type?: string | null
          event_date?: string | null
          extraction_provider?: string | null
          extraction_version?: string | null
          file_size: number
          id?: string
          mime_type: string
          normalized_storage_path?: string | null
          ocr_provider?: string | null
          ocr_version?: string | null
          original_filename: string
          processing_error_code?: string | null
          processing_error_message?: string | null
          processing_status?: Database["public"]["Enums"]["document_status"]
          sha256: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          document_type?: string | null
          event_date?: string | null
          extraction_provider?: string | null
          extraction_version?: string | null
          file_size?: number
          id?: string
          mime_type?: string
          normalized_storage_path?: string | null
          ocr_provider?: string | null
          ocr_version?: string | null
          original_filename?: string
          processing_error_code?: string | null
          processing_error_message?: string | null
          processing_status?: Database["public"]["Enums"]["document_status"]
          sha256?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      emergency_profiles: {
        Row: {
          allergies_summary: string | null
          blood_group: string | null
          conditions_summary: string | null
          emergency_contacts: NonNullable<Json>
          enabled: boolean
          enabled_fields: string[]
          full_name: string | null
          id: string
          medications_summary: string | null
          token_hash: string | null
          updated_at: string
          user_id: string
          warnings: string | null
        }
        Insert: {
          allergies_summary?: string | null
          blood_group?: string | null
          conditions_summary?: string | null
          emergency_contacts?: NonNullable<Json>
          enabled?: boolean
          enabled_fields?: string[]
          full_name?: string | null
          id?: string
          medications_summary?: string | null
          token_hash?: string | null
          updated_at?: string
          user_id: string
          warnings?: string | null
        }
        Update: {
          allergies_summary?: string | null
          blood_group?: string | null
          conditions_summary?: string | null
          emergency_contacts?: NonNullable<Json>
          enabled?: boolean
          enabled_fields?: string[]
          full_name?: string | null
          id?: string
          medications_summary?: string | null
          token_hash?: string | null
          updated_at?: string
          user_id?: string
          warnings?: string | null
        }
        Relationships: []
      }
      lab_results: {
        Row: {
          collected_at: string | null
          flag: string | null
          id: string
          medical_record_id: string
          numeric_value: number | null
          original_value: string
          reference_range: string | null
          specimen: string | null
          test_name: string
          unit: string | null
          user_id: string
        }
        Insert: {
          collected_at?: string | null
          flag?: string | null
          id?: string
          medical_record_id: string
          numeric_value?: number | null
          original_value: string
          reference_range?: string | null
          specimen?: string | null
          test_name: string
          unit?: string | null
          user_id: string
        }
        Update: {
          collected_at?: string | null
          flag?: string | null
          id?: string
          medical_record_id?: string
          numeric_value?: number | null
          original_value?: string
          reference_range?: string | null
          specimen?: string | null
          test_name?: string
          unit?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_medical_record_id_user_id_fkey"
            columns: ["medical_record_id", "user_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      medical_events: {
        Row: {
          created_at: string
          date_is_estimated: boolean
          description: string | null
          document_id: string | null
          event_date: string
          event_type: string
          id: string
          source_record_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_is_estimated?: boolean
          description?: string | null
          document_id?: string | null
          event_date: string
          event_type: string
          id?: string
          source_record_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_is_estimated?: boolean
          description?: string | null
          document_id?: string | null
          event_date?: string
          event_type?: string
          id?: string
          source_record_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_events_document_id_user_id_fkey"
            columns: ["document_id", "user_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "medical_events_source_record_id_document_id_user_id_fkey"
            columns: ["source_record_id", "document_id", "user_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id", "document_id", "user_id"]
          },
          {
            foreignKeyName: "medical_events_source_record_id_user_id_fkey"
            columns: ["source_record_id", "user_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      medical_records: {
        Row: {
          confidence: number
          created_at: string
          document_id: string
          event_date: string | null
          extraction_method: string
          extraction_version: string
          fingerprint: string
          id: string
          record_type: Database["public"]["Enums"]["record_kind"]
          review_status: Database["public"]["Enums"]["review_status"]
          source_block_ids: string[]
          source_page_number: number
          source_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence: number
          created_at?: string
          document_id: string
          event_date?: string | null
          extraction_method: string
          extraction_version: string
          fingerprint: string
          id?: string
          record_type: Database["public"]["Enums"]["record_kind"]
          review_status?: Database["public"]["Enums"]["review_status"]
          source_block_ids: string[]
          source_page_number: number
          source_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          document_id?: string
          event_date?: string | null
          extraction_method?: string
          extraction_version?: string
          fingerprint?: string
          id?: string
          record_type?: Database["public"]["Enums"]["record_kind"]
          review_status?: Database["public"]["Enums"]["review_status"]
          source_block_ids?: string[]
          source_page_number?: number
          source_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_document_id_source_page_number_fkey"
            columns: ["document_id", "source_page_number"]
            isOneToOne: false
            referencedRelation: "document_pages"
            referencedColumns: ["document_id", "page_number"]
          },
          {
            foreignKeyName: "medical_records_document_id_user_id_fkey"
            columns: ["document_id", "user_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      medications: {
        Row: {
          dose: string | null
          dose_unit: string | null
          duration: string | null
          end_date: string | null
          frequency: string | null
          generic_name: string | null
          id: string
          medical_record_id: string
          name: string
          route: string | null
          start_date: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          dose?: string | null
          dose_unit?: string | null
          duration?: string | null
          end_date?: string | null
          frequency?: string | null
          generic_name?: string | null
          id?: string
          medical_record_id: string
          name: string
          route?: string | null
          start_date?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          dose?: string | null
          dose_unit?: string | null
          duration?: string | null
          end_date?: string | null
          frequency?: string | null
          generic_name?: string | null
          id?: string
          medical_record_id?: string
          name?: string
          route?: string | null
          start_date?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_medical_record_id_user_id_fkey"
            columns: ["medical_record_id", "user_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      procedures: {
        Row: {
          id: string
          medical_record_id: string
          notes: string | null
          performed_at: string | null
          procedure_name: string
          user_id: string
        }
        Insert: {
          id?: string
          medical_record_id: string
          notes?: string | null
          performed_at?: string | null
          procedure_name: string
          user_id: string
        }
        Update: {
          id?: string
          medical_record_id?: string
          notes?: string | null
          performed_at?: string | null
          procedure_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedures_medical_record_id_user_id_fkey"
            columns: ["medical_record_id", "user_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      processing_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          document_id: string
          id: string
          job_type: string
          last_error_code: string | null
          last_error_message: string | null
          lock_token: string | null
          locked_at: string | null
          max_attempts: number
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          document_id: string
          id?: string
          job_type: string
          last_error_code?: string | null
          last_error_message?: string | null
          lock_token?: string | null
          locked_at?: string | null
          max_attempts?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          document_id?: string
          id?: string
          job_type?: string
          last_error_code?: string | null
          last_error_message?: string | null
          lock_token?: string | null
          locked_at?: string | null
          max_attempts?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_document_id_user_id_fkey"
            columns: ["document_id", "user_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          blood_group: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          key_hash: string
          request_count: number
          scope: string
          updated_at: string
          window_start: string
        }
        Insert: {
          key_hash: string
          request_count: number
          scope: string
          updated_at?: string
          window_start: string
        }
        Update: {
          key_hash?: string
          request_count?: number
          scope?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      share_link_documents: {
        Row: {
          document_id: string
          share_link_id: string
          user_id: string
        }
        Insert: {
          document_id: string
          share_link_id: string
          user_id: string
        }
        Update: {
          document_id?: string
          share_link_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_link_documents_document_id_user_id_fkey"
            columns: ["document_id", "user_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "share_link_documents_share_link_id_user_id_fkey"
            columns: ["share_link_id", "user_id"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      share_links: {
        Row: {
          access_code_hash: string | null
          access_count: number
          created_at: string
          expires_at: string
          id: string
          last_accessed_at: string | null
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          access_code_hash?: string | null
          access_count?: number
          created_at?: string
          expires_at: string
          id?: string
          last_accessed_at?: string | null
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          access_code_hash?: string | null
          access_count?: number
          created_at?: string
          expires_at?: string
          id?: string
          last_accessed_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      vitals: {
        Row: {
          id: string
          label: string
          measured_at: string | null
          measurement_type: string
          medical_record_id: string
          numeric_value: number | null
          original_value: string
          secondary_value: number | null
          unit: string | null
          user_id: string
        }
        Insert: {
          id?: string
          label: string
          measured_at?: string | null
          measurement_type: string
          medical_record_id: string
          numeric_value?: number | null
          original_value: string
          secondary_value?: number | null
          unit?: string | null
          user_id: string
        }
        Update: {
          id?: string
          label?: string
          measured_at?: string | null
          measurement_type?: string
          medical_record_id?: string
          numeric_value?: number | null
          original_value?: string
          secondary_value?: number | null
          unit?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vitals_medical_record_id_user_id_fkey"
            columns: ["medical_record_id", "user_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_key_hash: string
          p_limit: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          first_denial: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      claim_document_processing_job: {
        Args: { p_job_id?: string | null; p_lock_timeout_seconds?: number }
        Returns: {
          attempt_count: number
          document_id: string
          file_size: number
          job_id: string
          lock_token: string
          max_attempts: number
          mime_type: string
          sha256: string
          storage_path: string
          user_id: string
        }[]
      }
      complete_document_processing_job: {
        Args: {
          p_job_id: string
          p_lock_token: string
          p_ocr_provider?: string | null
          p_ocr_version?: string | null
          p_pages: Json
        }
        Returns: boolean
      }
      complete_document_processing_with_extraction: {
        Args: {
          p_candidates: Json
          p_job_id: string
          p_lock_token: string
          p_ocr_provider?: string | null
          p_ocr_version?: string | null
          p_pages: Json
        }
        Returns: boolean
      }
      fail_document_processing_job: {
        Args: {
          p_error_code: string
          p_error_message: string
          p_job_id: string
          p_lock_token: string
          p_retryable: boolean
        }
        Returns: string
      }
      renew_document_processing_job: {
        Args: { p_job_id: string; p_lock_token: string }
        Returns: boolean
      }
      review_medical_record: {
        Args: {
          p_action: string
          p_correction?: Json | null
          p_document_id: string
          p_record_id: string
        }
        Returns: Database["public"]["Enums"]["document_status"]
      }
    }
    Enums: {
      document_status:
        | "uploaded"
        | "queued"
        | "processing"
        | "needs_review"
        | "completed"
        | "failed"
      job_status: "queued" | "processing" | "completed" | "failed"
      record_kind:
        | "diagnosis"
        | "medication"
        | "lab"
        | "allergy"
        | "procedure"
        | "vital"
        | "doctor_note"
      review_status: "extracted" | "approved" | "corrected" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      document_status: [
        "uploaded",
        "queued",
        "processing",
        "needs_review",
        "completed",
        "failed",
      ],
      job_status: ["queued", "processing", "completed", "failed"],
      record_kind: [
        "diagnosis",
        "medication",
        "lab",
        "allergy",
        "procedure",
        "vital",
        "doctor_note",
      ],
      review_status: ["extracted", "approved", "corrected", "rejected"],
    },
  },
} as const
