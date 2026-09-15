import { alchemyReferencePort } from "./alchemy-references";
import { validateAgainstKind } from "@/features/content-ir/registry/validate-against-kind";
jest.mock("@/features/content-ir/registry/validate-against-kind", () => ({validateAgainstKind:jest.fn()}));
const validate = jest.mocked(validateAgainstKind);
const ref = {id:"table",label:"Table",noun:"table",items:[{table_id:"table-identity"}]};
beforeEach(()=>jest.clearAllMocks());
it("uses the canonical registered kind and fence format",async()=>{
 validate.mockResolvedValue({checked:true,ok:true,errors:[],degradedReason:null,kind:"directive_v1_reference_table"});
 const text=await alchemyReferencePort.build(ref);
 expect(validate).toHaveBeenCalledWith({__kind:"directive_v1_reference_table",items:ref.items},"directive_v1_reference_table");
 expect(text).toBe('```matrx\n{"__kind":"directive_v1_reference_table","items":[{"table_id":"table-identity"}]}\n```');
});
it("refuses an unregistered or invalid identity instead of minting a fence",async()=>{
 validate.mockResolvedValue({checked:true,ok:false,errors:["table_id required"],degradedReason:null,kind:"directive_v1_reference_table"});
 await expect(alchemyReferencePort.build({...ref,items:[{}]})).rejects.toThrow("table_id required");
});
it("does not treat unavailable validation as success",async()=>{
 validate.mockResolvedValue({checked:false,ok:false,errors:["registry unreachable"],degradedReason:"catalog_unreachable",kind:"directive_v1_reference_table"});
 await expect(alchemyReferencePort.build(ref)).rejects.toThrow("registry unreachable");
});
