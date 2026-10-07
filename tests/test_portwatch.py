import pytest
from hormuz_sources.portwatch import CHOKEPOINTS_DAILY, PORTS_DAILY, CHOKEPOINTS_REF, PORTS_REF, since_where, iso3_where


def test_specs_have_expected_layers_and_fields():
    assert CHOKEPOINTS_DAILY.layer == "Daily_Chokepoints_Data"
    assert "n_tanker" in CHOKEPOINTS_DAILY.int_fields and "capacity_tanker" in CHOKEPOINTS_DAILY.float_fields
    assert PORTS_DAILY.layer == "Daily_Ports_Data" and "ISO3" in PORTS_DAILY.str_fields
    assert "export_tanker" in PORTS_DAILY.float_fields and "portcalls_tanker" in PORTS_DAILY.int_fields
    assert CHOKEPOINTS_REF.layer == "PortWatch_chokepoints_database" and "lat" in CHOKEPOINTS_REF.float_fields
    assert PORTS_REF.layer == "PortWatch_ports_database"
    assert CHOKEPOINTS_DAILY.out_fields == list(CHOKEPOINTS_DAILY.str_fields + CHOKEPOINTS_DAILY.int_fields + CHOKEPOINTS_DAILY.float_fields)


def test_since_where():
    assert since_where("2019-01-01") == "date >= '2019-01-01'"


@pytest.mark.parametrize("bad", ["2019-1-1", "2019-01-01' OR 1=1 --", ""])
def test_since_where_rejects_bad(bad):
    with pytest.raises(ValueError):
        since_where(bad)


def test_iso3_where():
    assert iso3_where("SAU, are") == "ISO3 IN ('SAU','ARE')"
    assert iso3_where("SAU,ARE", since="2024-01-01") == "ISO3 IN ('SAU','ARE') AND date >= '2024-01-01'"


@pytest.mark.parametrize("bad", ["", "SA", "SAU,'); DROP", "SAUD"])
def test_iso3_where_rejects_bad(bad):
    with pytest.raises(ValueError):
        iso3_where(bad)
