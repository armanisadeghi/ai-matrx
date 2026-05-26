// 'use client';

// import React, { useState } from "react";
// import { motion, AnimatePresence } from "motion/react";
// import { Card, CardContent } from "@/components/ui/card";
// import {
//   componentTypes,
//   sourceTypes,
//   getComponentIcon,
//   getSourceIcon,
// } from "@/app/(dev)/demos/tests/recipe-creation/brokers-two/constants";
// import { FloatingLabelInput } from "@/components/matrx/input";
// import FloatingLabelTextArea from "@/components/matrx/input/FloatingLabelTextArea";

// import BrokerHeader from "../BrokerCardHeader";
// import SelectWithIconDisplay from "@/components/matrx/SelectWithIconDisplay";

// // Convert the existing types to match SelectWithIconDisplay format
// const componentTypeItems = componentTypes.map(type => ({
//   icon: () => getComponentIcon(type.value),
//   label: type.label,
//   value: type.value,
// }));

// const sourceTypeItems = sourceTypes.map(type => ({
//   icon: () => getSourceIcon(type.value),
//   label: type.label,
//   value: type.value,
// }));

// const BrokerEditor = ({ data, onChange, onDelete }) => {
//   const [isOpen, setIsOpen] = useState(true);
//   const needsSourceDetails = ["API", "Database", "Function"].includes(
//     data.defaultSource
//   );

//   const handleChange = (field, value) => {
//     onChange?.({
//       ...data,
//       [field]: value,
//     });
//   };

//   const handleComponentTypeChange = (selectedItems) => {
//     // Since this isn't a multi-select use case, we'll just take the first item
//     const selectedType = selectedItems[0]?.value || "";
//     handleChange("componentType", selectedType);
//   };

//   const handleSourceTypeChange = (selectedItems) => {
//     // Since this isn't a multi-select use case, we'll just take the first item
//     const selectedSource = selectedItems[0]?.value || "";
//     handleChange("defaultSource", selectedSource);
//   };

//   return (
//     <motion.div
//       initial={{ opacity: 0, y: -10 }}
//       animate={{ opacity: 1, y: 0 }}
//       exit={{ opacity: 0, y: 10 }}
//       className="my-4 last:mb-0"
//     >
//       <Card className="bg-elevation2 border border-elevation3 rounded-lg">
//         <BrokerHeader
//           data={data}
//           isOpen={isOpen}
//           onToggle={() => setIsOpen(!isOpen)}
//           onDelete={onDelete}
//         />

//         <AnimatePresence>
//           {isOpen && (
//             <motion.div
//               initial={{ height: 0, opacity: 0 }}
//               animate={{ height: "auto", opacity: 1 }}
//               exit={{ height: 0, opacity: 0 }}
//               className="overflow-hidden"
//             >
//               <CardContent className="p-2 bg-background space-y-2 border-t">
//                 <div className="flex flex-wrap gap-2">
//                   <div className="basis-52 grow">
//                     <FloatingLabelInput
//                       id="displayName"
//                       label="Display Name"
//                       value={data.displayName}
//                       onChange={(e) => handleChange("displayName", e.target.value)}
//                     />
//                   </div>
//                   <div className="basis-52 grow">
//                     <FloatingLabelInput
//                       id="officialName"
//                       label="Official Name"
//                       value={data.officialName}
//                       onChange={(e) => handleChange("officialName", e.target.value)}
//                     />
//                   </div>
//                 </div>

//                 <FloatingLabelTextArea
//                   id="value"
//                   label="Broker Value"
//                   value={data.value}
//                   onChange={(e) => handleChange("value", e.target.value)}
//                   rows={3}
//                 />

//                 <div className="flex flex-wrap gap-2">
//                   <div className="basis-52 grow">
//                     <SelectWithIconDisplay
//                       items={componentTypeItems}
//                       onChange={handleComponentTypeChange}
//                       placeholder="Component Type"
//                       className="bg-elevation1"
//                       maxHeight="max-h-48"
//                     />
//                   </div>

//                   <div className="basis-52 grow">
//                     <SelectWithIconDisplay
//                       items={sourceTypeItems}
//                       onChange={handleSourceTypeChange}
//                       placeholder="Default Source"
//                       className="bg-elevation1"
//                       maxHeight="max-h-48"
//                     />
//                   </div>
//                 </div>

//                 {needsSourceDetails && (
//                   <FloatingLabelInput
//                     id="sourceDetails"
//                     label={`${data.defaultSource} Details`}
//                     value={data.sourceDetails}
//                     onChange={(e) => handleChange("sourceDetails", e.target.value)}
//                   />
//                 )}
//               </CardContent>
//             </motion.div>
//           )}
//         </AnimatePresence>
//       </Card>
//     </motion.div>
//   );
// };

// export default BrokerEditor;