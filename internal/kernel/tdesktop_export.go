package kernel

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/md5" // #nosec G401 - Telegram Desktop file checksum/naming
	"crypto/rand"
	"crypto/sha1" // #nosec G401 - Telegram Desktop local encryption
	"crypto/sha512"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gotd/ige"
	"github.com/gotd/td/crypto"
	"github.com/gotd/td/session"
	"github.com/gotd/td/session/tdesktop"
	"github.com/iyear/tdl/core/storage"
	"golang.org/x/crypto/pbkdf2"

	"tgdesk/internal/paths"
)

// This writer produces the same on-disk layout as Telegram Desktop itself.
//
// Every tdata file is a "TDF$" container: magic, a little-endian version, the
// payload and an md5 trailer over payload+length+version+magic. Modern
// Telegram Desktop (WriteManager::writeNow) only keeps the "s" suffix variant
// of a file, so that is what we write. The auth layout mirrors
// Main::Account::serializeMtpAuthorization and Storage::Account::writeMtpData:
//
//	tdata/key_datas                    local key + account index, empty passcode
//	tdata/<dataKey>s                   MTP authorization (user, DC, auth key)
//	tdata/<dataKey>/maps               empty account map
//
// <dataKey> is Telegram's nibble-swapped md5("data") and matches the folder
// name official clients create. Only the current session's main-DC key is
// exported; Telegram Desktop creates the remaining DC keys on demand.
const (
	// Telegram Desktop rejects a file whose version is newer than its own.
	// A very old version is accepted by every 5.x-7.x client (the file
	// payloads below are version independent), so keep this conservative.
	// Official clients rewrite the files with their own AppVersion on start.
	tdesktopExportVersion = uint32(1)

	tdesktopAuthKeyLen   = 256
	tdesktopFileMagic    = "TDF$"
	tdesktopAESBlockSize = aes.BlockSize
)

// TDataExport describes the official Telegram Desktop files written after a
// successful login. It is exposed to the UI so the user can see where the
// portable tdata folder lives.
type TDataExport struct {
	Path      string `json:"path"`
	UserID    int64  `json:"userId"`
	DC        int    `json:"dc"`
	KeyID     string `json:"keyId"`
	CreatedAt string `json:"createdAt"`
}

type tdataExportRecord struct {
	Path      string `json:"path"`
	UserID    int64  `json:"userId"`
	DC        int    `json:"dc"`
	KeyID     string `json:"keyId"`
	CreatedAt string `json:"createdAt"`
}

// exportTelegramDesktopTData writes a no-passcode Telegram Desktop tdata next
// to tgdesk.exe from the authorized tdl session. It is best-effort from the
// login flow's point of view: a failed export must not invalidate a login,
// but the returned error is surfaced to the UI.
func exportTelegramDesktopTData(ns storage.Storage, user AuthUser) (*TDataExport, error) {
	if user.ID == 0 {
		return nil, fmt.Errorf("session has no user id")
	}

	loader := session.Loader{Storage: storage.NewSession(ns, false)}
	data, err := loader.Load(context.Background())
	if err != nil {
		return nil, fmt.Errorf("load session for tdata export: %w", err)
	}
	if data.DC <= 0 {
		return nil, fmt.Errorf("session has no data center")
	}
	if len(data.AuthKey) != tdesktopAuthKeyLen {
		return nil, fmt.Errorf("session has no usable auth key")
	}
	authKey := make([]byte, tdesktopAuthKeyLen)
	copy(authKey, data.AuthKey)
	if bytes.Equal(authKey, make([]byte, tdesktopAuthKeyLen)) {
		return nil, fmt.Errorf("session auth key is empty")
	}

	salt := randomBytes(32)
	var localKey crypto.Key
	copy(localKey[:], randomBytes(len(localKey)))

	// key_data: the 256-byte local key is wrapped by a key derived from an
	// empty passcode and a random salt (CreateLocalKey with no passcode).
	passcodeKey := tdesktopLocalKey(nil, salt)
	keyEncrypted := tdesktopEncryptDescriptor(localKey[:], passcodeKey)

	// Accounts info: account count, account index, active index.
	infoPayload := make([]byte, 12)
	binary.BigEndian.PutUint32(infoPayload[0:], 1) // one account
	binary.BigEndian.PutUint32(infoPayload[4:], 0) // account index 0
	binary.BigEndian.PutUint32(infoPayload[8:], 0) // active account 0
	infoEncrypted := tdesktopEncryptDescriptor(infoPayload, localKey)

	keyData := append(tdesktopArray(salt, binary.BigEndian), tdesktopArray(keyEncrypted, binary.BigEndian)...)
	keyData = append(keyData, tdesktopArray(infoEncrypted, binary.BigEndian)...)

	// MTP authorization block: qint32(dbiMtpAuthorization) + QByteArray.
	authorization := tdesktopMTPAuthorization(user.ID, data.DC, authKey)
	authPayload := make([]byte, 8, 8+len(authorization))
	binary.BigEndian.PutUint32(authPayload[0:], 0x4b) // dbiMtpAuthorization
	binary.BigEndian.PutUint32(authPayload[4:], uint32(len(authorization)))
	authPayload = append(authPayload, authorization...)
	authEncrypted := tdesktopEncryptDescriptor(authPayload, localKey)
	dataFile := tdesktopArray(authEncrypted, binary.BigEndian)

	// An empty account map is enough for Telegram Desktop to start: the
	// authorization and the keys live in <dataKey>s. It is still written
	// because the account directory is part of the official layout.
	mapFile := tdesktopEmptyMap(localKey)

	root := paths.TData()
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, fmt.Errorf("create tdata folder: %w", err)
	}
	if err := backupTDesktopAuthFiles(root); err != nil {
		return nil, fmt.Errorf("backup Telegram Desktop tdata: %w", err)
	}

	dataKey := tdesktopFileKey("data")
	accountDir := filepath.Join(root, dataKey)
	if err := os.MkdirAll(accountDir, 0o700); err != nil {
		return nil, fmt.Errorf("create tdata account folder: %w", err)
	}

	// Write the "s" variant first, then remove the legacy 0/1 variants so
	// Telegram Desktop cannot fall back to a stale copy.
	files := map[string][]byte{
		filepath.Join(root, "key_datas"):  keyData,
		filepath.Join(root, dataKey+"s"):  dataFile,
		filepath.Join(accountDir, "maps"): mapFile,
	}
	for path, payload := range files {
		if err := writeTDesktopFile(path, payload, tdesktopExportVersion); err != nil {
			return nil, err
		}
	}
	for _, name := range []string{
		"key_data0", "key_data1",
		dataKey + "0", dataKey + "1",
	} {
		_ = os.Remove(filepath.Join(root, name))
	}
	// Official clients only keep the current map file.
	_ = os.Remove(filepath.Join(accountDir, "map0"))
	_ = os.Remove(filepath.Join(accountDir, "map1"))

	keyID := tdesktopAuthKeyID(authKey)
	created := time.Now().UTC().Format(time.RFC3339)
	export := &TDataExport{
		Path:      root,
		UserID:    user.ID,
		DC:        data.DC,
		KeyID:     keyID,
		CreatedAt: created,
	}
	record := tdataExportRecord(*export)
	if encoded, err := json.MarshalIndent(record, "", "  "); err == nil {
		_ = os.WriteFile(filepath.Join(paths.Data(), "tdata-export.json"), encoded, 0o600)
	}
	_ = os.WriteFile(
		filepath.Join(paths.Data(), ".telegram-desktop-import"),
		[]byte(tdataFingerprint()),
		0o600,
	)
	return export, nil
}

// tdesktopMTPAuthorization mirrors
// Main::Account::serializeMtpAuthorization:
//
//	quint64 wideIdsTag, quint64 userId, qint32 mainDc,
//	qint32 keysCount, (qint32 dcId, 256-byte key)*, qint32 keysToDestroyCount
func tdesktopMTPAuthorization(userID int64, dc int, authKey []byte) []byte {
	out := make([]byte, 0, 8+8+4+4+4+len(authKey)+4)
	var u32 [4]byte
	var u64 [8]byte

	binary.BigEndian.PutUint64(u64[:], ^uint64(0)) // kWideIdsTag
	out = append(out, u64[:]...)
	binary.BigEndian.PutUint64(u64[:], uint64(userID))
	out = append(out, u64[:]...)
	binary.BigEndian.PutUint32(u32[:], uint32(dc))
	out = append(out, u32[:]...)
	binary.BigEndian.PutUint32(u32[:], 1) // keys count
	out = append(out, u32[:]...)
	binary.BigEndian.PutUint32(u32[:], uint32(dc))
	out = append(out, u32[:]...)
	out = append(out, authKey...)
	out = append(out, 0, 0, 0, 0) // keysToDestroy count
	return out
}

func tdesktopEmptyMap(localKey crypto.Key) []byte {
	// writeMap always starts with two empty legacy blobs (salt and wrapped
	// local key) followed by the encrypted map. The map itself is empty.
	encrypted := tdesktopEncryptDescriptor(nil, localKey)
	out := append(tdesktopArray(nil, binary.BigEndian), tdesktopArray(nil, binary.BigEndian)...)
	return append(out, tdesktopArray(encrypted, binary.BigEndian)...)
}

// tdesktopEncryptDescriptor builds Telegram Desktop's EncryptedDescriptor:
// little-endian unpadded length (including the four length bytes), payload,
// random padding to an AES block boundary, then the local-key IGE envelope.
func tdesktopEncryptDescriptor(payload []byte, localKey crypto.Key) []byte {
	total := 4 + len(payload)
	full := (total + tdesktopAESBlockSize - 1) / tdesktopAESBlockSize * tdesktopAESBlockSize
	plain := make([]byte, full)
	binary.LittleEndian.PutUint32(plain[0:], uint32(total))
	copy(plain[4:], payload)
	if padding := full - total; padding > 0 {
		copy(plain[total:], randomBytes(padding))
	}
	return tdesktopEncryptLocal(plain, localKey)
}

func tdesktopAuthKeyID(authKey []byte) string {
	var key crypto.Key
	copy(key[:], authKey)
	id := key.ID()
	return strings.ToUpper(hex.EncodeToString(id[:]))
}

func tdesktopArray(data []byte, order binary.ByteOrder) []byte {
	out := make([]byte, 4, 4+len(data))
	if data == nil {
		// QDataStream serializes a null QByteArray as 0xffffffff; an empty
		// one is length 0. The map header expects empty, not null.
		order.PutUint32(out, 0)
		return out
	}
	order.PutUint32(out, uint32(len(data)))
	return append(out, data...)
}

func randomBytes(size int) []byte {
	out := make([]byte, size)
	if _, err := rand.Read(out); err != nil {
		panic(fmt.Sprintf("read random bytes: %v", err))
	}
	return out
}

func tdesktopLocalKey(passcode, salt []byte) (out crypto.Key) {
	iterations := 1
	if len(passcode) > 0 {
		iterations = 100000
	}
	h := sha512.New()
	_, _ = h.Write(salt)
	_, _ = h.Write(passcode)
	_, _ = h.Write(salt)
	key := pbkdf2.Key(h.Sum(nil), salt, iterations, len(out), sha512.New)
	copy(out[:], key)
	return out
}

func tdesktopEncryptLocal(decrypted []byte, localKey crypto.Key) []byte {
	if len(decrypted)%tdesktopAESBlockSize != 0 {
		panic("telegram desktop payload must be block aligned")
	}
	var msgKey [16]byte
	sum := sha1.Sum(decrypted)
	copy(msgKey[:], sum[:])
	aesKey, aesIV := crypto.OldKeys(localKey, msgKey, crypto.Server)
	block, err := aes.NewCipher(aesKey[:])
	if err != nil {
		panic(fmt.Sprintf("create Telegram Desktop cipher: %v", err))
	}
	out := make([]byte, 16+len(decrypted))
	copy(out, msgKey[:])
	ige.EncryptBlocks(block, aesIV[:], out[16:], decrypted)
	return out
}

func tdesktopFileKey(value string) string {
	sum := md5.Sum([]byte(value)) // #nosec G401 - Telegram Desktop file naming
	for i := range sum {
		sum[i] = sum[i]<<4 | sum[i]>>4
	}
	return strings.ToUpper(hex.EncodeToString(sum[:]))[:16]
}

func writeTDesktopFile(path string, data []byte, version uint32) error {
	var versionBytes [4]byte
	binary.LittleEndian.PutUint32(versionBytes[:], version)

	var out bytes.Buffer
	out.WriteString(tdesktopFileMagic)
	out.Write(versionBytes[:])
	out.Write(data)

	hash := md5.New() // #nosec G401 - Telegram Desktop file checksum
	_, _ = hash.Write(data)
	var length [4]byte
	binary.LittleEndian.PutUint32(length[:], uint32(len(data)))
	_, _ = hash.Write(length[:])
	_, _ = hash.Write(versionBytes[:])
	_, _ = hash.Write([]byte(tdesktopFileMagic))
	out.Write(hash.Sum(nil))

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, out.Bytes(), 0o600); err != nil {
		return fmt.Errorf("write %s: %w", filepath.Base(path), err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("replace %s: %w", filepath.Base(path), err)
	}
	return nil
}

// backupTDesktopAuthFiles keeps a rollback copy of the authorization files in
// data/tdata-backup before tgdesk replaces them. Only small auth files are
// copied; caches, emoji sets and downloads are intentionally left alone.
func backupTDesktopAuthFiles(root string) error {
	dest := filepath.Join(paths.Data(), "tdata-backup")
	if err := os.RemoveAll(dest); err != nil {
		return err
	}
	if err := os.MkdirAll(dest, 0o700); err != nil {
		return err
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !isTDataAuthFile(entry.Name()) {
			continue
		}
		if err := copyFile(filepath.Join(root, entry.Name()), filepath.Join(dest, entry.Name())); err != nil {
			return err
		}
	}

	// The account folder carries maps/configs next to the hashed data file.
	for _, entry := range entries {
		if !entry.IsDir() || !isTDataAccountDir(entry.Name()) {
			continue
		}
		target := filepath.Join(dest, entry.Name())
		if err := os.MkdirAll(target, 0o700); err != nil {
			return err
		}
		for _, name := range []string{"maps", "map0", "map1", "configs", "config0", "config1"} {
			source := filepath.Join(root, entry.Name(), name)
			if _, err := os.Stat(source); err != nil {
				continue
			}
			if err := copyFile(source, filepath.Join(target, name)); err != nil {
				return err
			}
		}
	}
	return nil
}

func copyFile(source, target string) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	return os.WriteFile(target, data, 0o600)
}

func isTDataAccountDir(name string) bool {
	if len(name) != 16 {
		return false
	}
	for i := 0; i < 16; i++ {
		c := name[i]
		if (c < '0' || c > '9') && (c < 'A' || c > 'F') {
			return false
		}
	}
	return true
}

// tdataSessionIdentity is a stable description of the authorization stored in
// tdata, independent of file timestamps. Telegram Desktop rewrites key_data
// (new salt) and its map on every start, so a mtime-based fingerprint would
// wrongly re-import an unchanged login.
func tdataSessionIdentity() (string, error) {
	accounts, err := tdesktop.Read(paths.TData(), nil)
	if err != nil {
		return "", err
	}
	if len(accounts) == 0 {
		return "", fmt.Errorf("no accounts")
	}
	account := accounts[0]
	dc := account.Authorization.MainDC
	key, ok := account.Authorization.Keys[dc]
	if !ok {
		return "", fmt.Errorf("no key for main DC %d", dc)
	}
	keyID := key.ID()
	return fmt.Sprintf("%d:%d:%s", account.Authorization.UserID, dc, strings.ToUpper(hex.EncodeToString(keyID[:]))), nil
}

// tdataMatchesSession reports whether tdata already contains exactly the
// authorization held by the tdl session.
func tdataMatchesSession(ns storage.Storage, data *session.Data, userID int64) bool {
	if data == nil || userID == 0 {
		return false
	}
	expectedID := data.AuthKeyID
	if len(expectedID) != 8 {
		if len(data.AuthKey) != tdesktopAuthKeyLen {
			return false
		}
		var key crypto.Key
		copy(key[:], data.AuthKey)
		id := key.ID()
		expectedID = id[:]
	}
	accounts, err := tdesktop.Read(paths.TData(), nil)
	if err != nil || len(accounts) != 1 {
		return false
	}
	account := accounts[0]
	if account.Authorization.UserID != uint64(userID) || account.Authorization.MainDC != data.DC {
		return false
	}
	key, ok := account.Authorization.Keys[data.DC]
	if !ok {
		return false
	}
	id := key.ID()
	return bytes.Equal(id[:], expectedID)
}
