import { parseKeePassXml } from "../keepass-xml";
import { prepareStructuredImportCommand } from "../structured-import";

const id = "AAAAAAAAAAAAAAAAAAAAAA==";
const id2 = "AQAAAAAAAAAAAAAAAAAAAA==";
const limits = {
  maxFileBytes: 100_000,
  maxRecords: 100,
  maxCellBytes: 10_000,
  maxJsonDepth: 16,
};
const fields = (extra = "") =>
  `<String><Key>Title</Key><Value>Example</Value></String><String><Key>UserName</Key><Value>person</Value></String><String><Key>Password</Key><Value>secret</Value></String><String><Key>URL</Key><Value>https://example.test/login</Value></String><String><Key>OTP</Key><Value>otpauth://inactive</Value></String>${extra}`;
const entry = (extra = "", uuid = id2) =>
  `<Entry><UUID>${uuid}</UUID>${fields(extra)}<History><Entry><UUID>${uuid}</UUID><String><Key>Title</Key><Value>old</Value></String></Entry></History></Entry>`;
const group = (body: string, uuid = id) =>
  `<Group><UUID>${uuid}</UUID><Name>Root</Name>${body}</Group>`;
const wrap = (body: string, meta = "") =>
  `<?xml version="1.0" encoding="UTF-8"?><KeePassFile><Meta>${meta}</Meta><Root>${body}</Root></KeePassFile>`;

describe("KeePass XML", () => {
  test("normalizes nested login and keeps an ordered provenance representation", () => {
    const xml = wrap(
      group(
        `<Group><UUID>${id2}</UUID><Name>Nested</Name>${entry("", "AgAAAAAAAAAAAAAAAAAAAA==")}</Group>`,
      ),
      "<DatabaseName>Vault</DatabaseName>",
    );
    const out = parseKeePassXml(xml, limits);
    expect(out.records[0]).toEqual(
      expect.objectContaining({
        status: "supported",
        kind: "website_login",
        sourceState: "active",
        hasOtp: true,
        username: "person",
        password: "secret",
      }),
    );
    expect(
      JSON.parse((out.records[0] as { sourceRecord: string }).sourceRecord),
    ).toEqual(
      expect.objectContaining({
        group_path: ["Root", "Nested"],
        entry_xml: expect.stringContaining("<History>"),
        meta_xml: expect.any(Array),
      }),
    );
  });
  test("retains trash provenance and reports deleted tombstones", () => {
    const xml = wrap(
      group(entry(), id) +
        `<DeletedObjects><DeletedObject><UUID>${id2}</UUID><DeletionTime>2025-01-01T00:00:00Z</DeletionTime></DeletedObject></DeletedObjects>`,
      `<RecycleBinUUID>${id}</RecycleBinUUID>`,
    );
    const out = parseKeePassXml(xml, limits);
    expect(out.records[0]).toEqual(
      expect.objectContaining({ sourceState: "deleted" }),
    );
    expect(out.fileNotices).toEqual([{ code: "deleted_tombstones", count: 1 }]);
  });
  test("attributes binary/passkey support to their entry and accounts for unused definitions", () => {
    const xml = wrap(
      group(
        `${entry('<Binary><Key>a</Key><Value Ref="0"/></Binary>')}${entry("<String><Key>KPEX_PASSKEY_USERNAME</Key><Value>x</Value></String>", "AwAAAAAAAAAAAAAAAAAAAA==")}`,
      ),
      '<Binaries><Binary ID="0">cGF5bG9hZA==</Binary><Binary ID="1">dW51c2Vk</Binary></Binaries>',
    );
    const out = parseKeePassXml(xml, limits);
    expect(out.records.map((record) => record.status)).toEqual([
      "unsupported",
      "unsupported",
    ]);
    expect(out.fileNotices).toEqual([
      { code: "unsupported_binary_definitions", count: 1 },
    ]);
  });
  test("rejects duplicate UUID/String/cardinality and XML entities or PI", () => {
    expect(
      parseKeePassXml(wrap(group(`${entry()}${entry("", id2)}`)), limits)
        .records,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "invalid" })]),
    );
    expect(
      parseKeePassXml(
        wrap(
          group(entry("<String><Key>Title</Key><Value>again</Value></String>")),
        ),
        limits,
      ).records[0],
    ).toEqual(expect.objectContaining({ status: "invalid" }));
    expect(() =>
      parseKeePassXml(
        wrap(group(entry())).replace(
          "<Meta>",
          "<Meta><RecycleBinUUID>bad</RecycleBinUUID><RecycleBinUUID>bad</RecycleBinUUID>",
        ),
        limits,
      ),
    ).toThrow();
    expect(() =>
      parseKeePassXml(`<!DOCTYPE x>${wrap(group(entry()))}`, limits),
    ).toThrow();
    expect(() =>
      parseKeePassXml(`<?evil x?>${wrap(group(entry()))}`, limits),
    ).toThrow();
  });
  test("classifies attributable unknown extensions and preserves CRLF, CDATA and Unicode", () => {
    const source = parseKeePassXml(
      wrap(
        group(
          entry(
            "<String><Key>Notes</Key><Value><![CDATA[line\\r\\nλ😀]]></Value></String>",
          ),
        ),
      ),
      limits,
    ).records[0] as { sourceRecord: string };
    expect(JSON.parse(source.sourceRecord).entry_xml).toContain(
      "<![CDATA[line\\r\\nλ😀]]>",
    );
    expect(
      parseKeePassXml(wrap(group(entry("<VendorExtension/>"))), limits)
        .records[0],
    ).toEqual(expect.objectContaining({ status: "unsupported" }));
    expect(() =>
      parseKeePassXml(
        wrap(group(entry())).replace("<Root>", "<Root><Unknown/>"),
        limits,
      ),
    ).toThrow();
  });
  test("enforces file, cell, record and depth bounds", () => {
    expect(() =>
      parseKeePassXml(wrap(group(entry())), { ...limits, maxFileBytes: 1 }),
    ).toThrow();
    expect(() =>
      parseKeePassXml(
        wrap(
          group(
            entry("<String><Key>Notes</Key><Value>too-long</Value></String>"),
          ),
        ),
        { ...limits, maxCellBytes: 2 },
      ),
    ).toThrow();
    expect(() =>
      parseKeePassXml(wrap(group(entry())), { ...limits, maxRecords: 0 }),
    ).toThrow();
    expect(() =>
      parseKeePassXml(
        wrap(
          group(
            `<Group><UUID>${id2}</UUID><Name>Deep</Name>${entry("", "AwAAAAAAAAAAAAAAAAAAAA==")}</Group>`,
          ),
        ),
        { ...limits, maxJsonDepth: 2 },
      ),
    ).toThrow();
  });
  test("keeps source encounter order and exact raw spelling, and never projects protected values", () => {
    const third = entry("", "AwAAAAAAAAAAAAAAAAAAAA==").replace(
      "Example",
      "Third",
    );
    const second = entry("", "AgAAAAAAAAAAAAAAAAAAAA==").replace(
      "Example",
      "Second",
    );
    const first = entry("", id2).replace("Example", "First");
    const ordered = parseKeePassXml(
      wrap(
        group(
          `${first}<Group><UUID>BAAAAAAAAAAAAAAAAAAAAA==</UUID><Name>Nested</Name>${second}</Group>${third}`,
        ),
      ),
      limits,
    );
    expect(ordered.records.map((row) => row.title)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    const raw = parseKeePassXml(
      wrap(
        group(
          entry(
            "<String><Key>Notes</Key><Value><![CDATA[a\r\n&amp;😀]]></Value></String>",
          ),
        ),
      ),
      limits,
    ).records[0] as { sourceRecord: string };
    expect(JSON.parse(raw.sourceRecord).entry_xml).toContain(
      "<![CDATA[a\r\n&amp;😀]]>",
    );
    expect(
      parseKeePassXml(
        wrap(
          group(
            entry().replace(
              "<Value>secret</Value>",
              '<Value Protected="True">ciphertext</Value>',
            ),
          ),
        ),
        limits,
      ).records[0],
    ).toEqual(expect.objectContaining({ status: "unsupported" }));
    expect(() =>
      parseKeePassXml(wrap(`${group(entry())}${group(entry(), id2)}`), limits),
    ).toThrow();
  });
  test("uses the writer-shaped Meta and Times scalar grammar without sequence assumptions", () => {
    const times =
      "<Times><UsageCount>0</UsageCount><Expires>False</Expires><CreationTime>2025-01-01T00:00:00Z</CreationTime></Times>";
    const shaped = wrap(
      group(entry().replace("</Entry>", `${times}</Entry>`)),
      `<Generator>KeePassXC</Generator><RecycleBinEnabled>False</RecycleBinEnabled><HistoryMaxItems>10</HistoryMaxItems><MemoryProtection><ProtectPassword>True</ProtectPassword></MemoryProtection>`,
    );
    expect(parseKeePassXml(shaped, limits).records[0]).toEqual(
      expect.objectContaining({ status: "supported" }),
    );
    expect(() =>
      parseKeePassXml(
        wrap(group(entry()), "<UnknownMeta>x</UnknownMeta>"),
        limits,
      ),
    ).toThrow();
    expect(
      parseKeePassXml(
        wrap(
          group(
            entry().replace(
              "</Entry>",
              "<Times><Expires>yes</Expires></Times><Times/></Entry>",
            ),
          ),
        ),
        limits,
      ).records[0],
    ).toEqual(expect.objectContaining({ status: "invalid" }));
    expect(
      parseKeePassXml(
        wrap(
          group(
            entry().replace(
              "</Entry>",
              "<Times><UsageCount>01</UsageCount></Times></Entry>",
            ),
          ),
        ),
        limits,
      ).records[0],
    ).toEqual(expect.objectContaining({ status: "invalid" }));
    expect(
      parseKeePassXml(
        wrap(
          group(
            entry().replace(
              "</Entry>",
              "<Times><CreationTime>January 1 2025</CreationTime></Times></Entry>",
            ),
          ),
        ),
        limits,
      ).records[0],
    ).toEqual(expect.objectContaining({ status: "invalid" }));
    expect(
      parseKeePassXml(
        wrap(group(entry("", "AAAAAAAAAAAAAAAAAAAAAB=="))),
        limits,
      ).records[0],
    ).toEqual(expect.objectContaining({ status: "invalid" }));
  });
  test("uses one aggregate parsed-work budget for history, binary definitions and tombstones", () => {
    const defs =
      '<Binaries><Binary ID="0">x</Binary><Binary ID="1">y</Binary></Binaries>';
    expect(() =>
      parseKeePassXml(wrap(group(entry()), defs), { ...limits, maxRecords: 2 }),
    ).toThrow();
    expect(() =>
      parseKeePassXml(
        wrap(
          group(entry()) +
            `<DeletedObjects><DeletedObject><UUID>${id}</UUID><DeletionTime>2025-01-01T00:00:00Z</DeletionTime></DeletedObject></DeletedObjects>`,
        ),
        { ...limits, maxRecords: 2 },
      ),
    ).toThrow();
    const writerEntry = entry().replace(
      "</Entry>",
      `<PreviousParentGroup>${id}</PreviousParentGroup></Entry>`,
    );
    const writerGroup = group(writerEntry).replace(
      "<Name>Root</Name>",
      "<Name>Root</Name><Tags>tag</Tags>",
    );
    const writerFields = parseKeePassXml(wrap(writerGroup), limits);
    expect(writerFields.records[0]).toEqual(
      expect.objectContaining({ status: "supported" }),
    );
  });
  test("accepts actual KDBX4 writer time values and rejects calendar normalization", () => {
    const kdbx4 = "0JOx4gwAAAA=";
    const allTimes = `<Times><LastModificationTime>${kdbx4}</LastModificationTime><CreationTime>${kdbx4}</CreationTime><LastAccessTime>${kdbx4}</LastAccessTime><ExpiryTime>${kdbx4}</ExpiryTime><Expires>False</Expires><UsageCount>0</UsageCount><LocationChanged>${kdbx4}</LocationChanged></Times>`;
    const icon = `<CustomIcons><Icon><UUID>${id}</UUID><Name>icon</Name><LastModificationTime>${kdbx4}</LastModificationTime><Data>YWJj</Data></Icon></CustomIcons>`;
    const meta = `<SettingsChanged>${kdbx4}</SettingsChanged>${icon}<CustomData><Item><Key>k</Key><Value>v</Value><LastModificationTime>${kdbx4}</LastModificationTime></Item></CustomData>`;
    const completeEntry = entry().replace(
      "</Entry>",
      `${allTimes}<AutoType><Enabled>True</Enabled><DataTransferObfuscation>-1</DataTransferObfuscation><DefaultSequence>{USERNAME}</DefaultSequence><Association><Window>x</Window><KeystrokeSequence>{PASSWORD}</KeystrokeSequence></Association></AutoType><CustomData><Item><Key>e</Key><Value>v</Value></Item></CustomData></Entry>`,
    );
    const completeGroup = group(completeEntry).replace(
      "</Group>",
      `<EnableAutoType>null</EnableAutoType><EnableSearching>Null</EnableSearching><PreviousParentGroup>${id}</PreviousParentGroup></Group>`,
    );
    const xml = wrap(completeGroup, meta);
    expect(parseKeePassXml(xml, limits).records[0]).toEqual(
      expect.objectContaining({ status: "supported" }),
    );
    expect(
      parseKeePassXml(
        wrap(
          group(
            entry().replace(
              "</Entry>",
              "<Times><CreationTime>2025-02-30T00:00:00Z</CreationTime></Times></Entry>",
            ),
          ),
        ),
        limits,
      ).records[0],
    ).toEqual(expect.objectContaining({ status: "invalid" }));
  });
  test.each([
    ["<IconID><Unexpected/></IconID>"],
    ["<AutoType><Enabled>maybe</Enabled></AutoType>"],
    [
      "<CustomData><Item><Key>x</Key><Key>y</Key><Value>z</Value></Item></CustomData>",
    ],
    ["<PreviousParentGroup>bad</PreviousParentGroup>"],
  ])("rejects malformed recognized subtree %s", (mutation) => {
    expect(
      parseKeePassXml(wrap(group(entry(mutation))), limits).records[0],
    ).toEqual(expect.objectContaining({ status: "invalid" }));
  });
  test("classifies valid inline Binary in current or history as unsupported, while invalid wins over unknown", () => {
    expect(
      parseKeePassXml(
        wrap(group(entry("<Binary><Key>a</Key><Value>YWJj</Value></Binary>"))),
        limits,
      ).records[0],
    ).toEqual(expect.objectContaining({ status: "unsupported" }));
    expect(
      parseKeePassXml(
        wrap(
          group(
            entry().replace(
              "</Entry></History>",
              "<Binary><Key>a</Key><Value>YWJj</Value></Binary></Entry></History>",
            ),
          ),
        ),
        limits,
      ).records[0],
    ).toEqual(expect.objectContaining({ status: "unsupported" }));
    expect(
      parseKeePassXml(
        wrap(
          group(
            entry(
              "<Vendor/><String><Key>Title</Key><Value>duplicate</Value></String>",
            ),
          ),
        ),
        limits,
      ).records[0],
    ).toEqual(expect.objectContaining({ status: "invalid" }));
  });
  test("allows literal PI spelling in CDATA but rejects actual PIs", () => {
    expect(
      parseKeePassXml(
        wrap(
          group(
            entry(
              "<String><Key>Notes</Key><Value><![CDATA[<?literal]]></Value></String>",
            ),
          ),
        ),
        limits,
      ).records[0],
    ).toEqual(expect.objectContaining({ status: "supported" }));
    expect(() =>
      parseKeePassXml(
        wrap(group(entry())).replace("</Meta>", "<?bad x?></Meta>"),
        limits,
      ),
    ).toThrow();
  });
  test("maps KeePass Notes through the canonical import_notes command field", () => {
    const record = parseKeePassXml(
      wrap(
        group(
          entry("<String><Key>Notes</Key><Value>preserve me</Value></String>"),
        ),
      ),
      limits,
    ).records[0]!;
    if (record.status !== "supported")
      throw new Error("fixture must be supported");
    const prepared = prepareStructuredImportCommand({
      record,
      principal: { type: "user" },
      expectedActor: { userId: "user", organizationId: "org" },
      rowId: "00000000-0000-4000-8000-000000000001",
      browserFillEnabled: false,
      includeDeleted: false,
      includeArchived: false,
      limits: {
        ...limits,
        maxColumns: 20,
        maxFields: 20,
        maxPlaintextFieldBytes: 100_000,
        maxRequestBodyBytes: 100_000,
      },
    });
    expect(prepared).toEqual(
      expect.objectContaining({
        status: "ready",
        command: expect.objectContaining({
          body: expect.objectContaining({
            fields: expect.arrayContaining([
              expect.objectContaining({
                field_key: "import_notes",
                value: "preserve me",
              }),
            ]),
          }),
        }),
      }),
    );
  });
  test("classifies a missing current UUID as invalid without throwing", () => {
    const xml = wrap(group(entry().replace(`<UUID>${id2}</UUID>`, "")));
    expect(parseKeePassXml(xml, limits).records[0]).toEqual(
      expect.objectContaining({ status: "invalid" }),
    );
  });
  test("rejects nested history and duplicate CustomData keys", () => {
    const nested = entry().replace(
      "</Entry></History>",
      "<History><Entry><UUID>AgAAAAAAAAAAAAAAAAAAAA==</UUID><String><Key>Title</Key><Value>deep</Value></String></Entry></History></Entry></History>",
    );
    expect(parseKeePassXml(wrap(group(nested)), limits).records[0]).toEqual(
      expect.objectContaining({ status: "invalid" }),
    );
    const duplicateCustom = entry(
      "<CustomData><Item><Key>same</Key><Value>1</Value></Item><Item><Key>same</Key><Value>2</Value></Item></CustomData>",
    );
    expect(
      parseKeePassXml(wrap(group(duplicateCustom)), limits).records[0],
    ).toEqual(expect.objectContaining({ status: "invalid" }));
  });
  test("counts metadata objects in the one parsed-work budget", () => {
    const icons = `<CustomIcons><Icon><UUID>${id}</UUID><Data>YWJj</Data></Icon><Icon><UUID>${id2}</UUID><Data>YWJj</Data></Icon></CustomIcons>`;
    expect(() =>
      parseKeePassXml(wrap(group(entry()), icons), {
        ...limits,
        maxRecords: 2,
      }),
    ).toThrow("more records");
  });
  test("accepts XML 1.0 declarations without encoding and early calendar years", () => {
    const yearOne = "0001-02-28T00:00:00Z";
    const yearNinetyNine = "0099-02-28T00:00:00Z";
    const withEarlyDates = entry().replace(
      "</Entry>",
      `<Times><CreationTime>${yearOne}</CreationTime><LastAccessTime>${yearNinetyNine}</LastAccessTime></Times></Entry>`,
    );
    const versionOnly = wrap(group(withEarlyDates)).replace(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<?xml version="1.0"?>',
    );
    expect(parseKeePassXml(versionOnly, limits).records[0]).toEqual(
      expect.objectContaining({ status: "supported" }),
    );
    const febThirty = wrap(
      group(
        entry().replace(
          "</Entry>",
          "<Times><CreationTime>0099-02-30T00:00:00Z</CreationTime></Times></Entry>",
        ),
      ),
    );
    expect(parseKeePassXml(febThirty, limits).records[0]).toEqual(
      expect.objectContaining({ status: "invalid" }),
    );
  });
  test("does not charge inline Entry binary payload separately from its owner", () => {
    const currentOnly = entry(
      "<Binary><Key>attachment</Key><Value>YWJj</Value></Binary>",
    ).replace(/<History>[\s\S]*<\/History>/, "");
    const xml = wrap(group(currentOnly));
    expect(
      parseKeePassXml(xml, { ...limits, maxRecords: 1 }).records[0],
    ).toEqual(expect.objectContaining({ status: "unsupported" }));
  });
});
