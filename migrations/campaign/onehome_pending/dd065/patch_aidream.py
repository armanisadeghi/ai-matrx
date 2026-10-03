from mkpatch import make
OWN = "    owner_id = ForeignKey(to_model='Users', to_column='id', to_schema='iam', null=False)\n"
make("aidream", {
 "db/models/legal.py": [("    is_public = BooleanField(default=False)\n", "", 1)],
 "db/models/education.py": [
   ("class StudyStructuredSection(MatrxEntity):\n    id = UUIDField(primary_key=True, null=False)\n" + OWN,
    "class StudyStructuredSection(MatrxEntity):\n    id = UUIDField(primary_key=True, null=False)\n", 1),
   ("class StudySourceChunk(MatrxEntity):\n    id = UUIDField(primary_key=True, null=False)\n" + OWN,
    "class StudySourceChunk(MatrxEntity):\n    id = UUIDField(primary_key=True, null=False)\n    created_by = ForeignKey(to_model='Users', to_column='id', to_schema='iam', null=False)\n", 1),
 ],
 "db/managers/education/study_structured_section.py": [
   ("    async def load_study_structured_sections_by_owner_id(self, owner_id: Any) -> list[Any]:\n        return await self.load_items(owner_id=owner_id)\n\n    async def filter_study_structured_sections_by_owner_id(self, owner_id: Any) -> list[Any]:\n        return await self.filter_items(owner_id=owner_id)\n\n", "", 1),
 ],
 "db/managers/education/study_source_chunk.py": [
   ("load_study_source_chunks_by_owner_id(self, owner_id: Any) -> list[Any]:\n        return await self.load_items(owner_id=owner_id)",
    "load_study_source_chunks_by_created_by(self, created_by: Any) -> list[Any]:\n        return await self.load_items(created_by=created_by)", 1),
   ("filter_study_source_chunks_by_owner_id(self, owner_id: Any) -> list[Any]:\n        return await self.filter_items(owner_id=owner_id)",
    "filter_study_source_chunks_by_created_by(self, created_by: Any) -> list[Any]:\n        return await self.filter_items(created_by=created_by)", 1),
 ],
 "db/helpers/auto_config_education.py": [
   ("'filter_fields': ['owner_id', 'organization_id', 'created_by', 'updated_by']", "'filter_fields': ['organization_id', 'created_by', 'updated_by']", 1),
   ("'filter_fields': ['owner_id', 'structured_section_id']", "'filter_fields': ['created_by', 'structured_section_id']", 1),
 ],
}, "dd065-batch1-aidream.patch")
